import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { billingAPI, hospitalAPI } from '../../utils/api';
import './CashierDashboard.css';

const CashierDashboard = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const [patients, setPatients] = useState([]);
    const [filteredPatients, setFilteredPatients] = useState([]);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [patientInfo, setPatientInfo] = useState(null);
    const [billingData, setBillingData] = useState({
        appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: []
    });

    const [activeTab, setActiveTab] = useState('dues'); // 'dues' | 'history'
    const [hospitalFacilities, setHospitalFacilities] = useState([]);
    const [addingFacility, setAddingFacility] = useState(false);
    const [facilityForm, setFacilityForm] = useState({
        name: '', pricePerDay: '', days: ''
    });

    const [processingPayment, setProcessingPayment] = useState(false);
    const [paymentMode, setPaymentMode] = useState('Cash');

    // Auth & Permission Check
    useEffect(() => {
        const role = (currentUser?.role || '').toLowerCase();
        const perms = currentUser?.permissions || [];
        if (!['billing', 'cashier', 'accountant', 'centraladmin', 'superadmin', 'hospitaladmin'].includes(role) && 
            !perms.includes('billing_view') && !perms.includes('billing_manage') && !perms.includes('*')) {
            navigate('/');
        }
    }, [navigate, currentUser]);

    // Load Patient List and Hospital Facilities
    useEffect(() => {
        fetchPatientsList();
        fetchHospitalFacilities();
    }, []);

    // Filter patients by search term
    useEffect(() => {
        if (!sidebarSearch.trim()) {
            setFilteredPatients(patients);
        } else {
            const q = sidebarSearch.toLowerCase();
            setFilteredPatients(
                patients.filter(p =>
                    (p.name || '').toLowerCase().includes(q) ||
                    (p.mrn || '').toLowerCase().includes(q) ||
                    (p.patientId || '').toLowerCase().includes(q) ||
                    (p.phone || '').includes(q)
                )
            );
        }
    }, [sidebarSearch, patients]);

    const fetchPatientsList = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await billingAPI.getPatients();
            if (res.success) {
                setPatients(res.patients || []);
                setFilteredPatients(res.patients || []);
            }
        } catch (err) {
            console.error('Error fetching patients:', err);
            setError('Error fetching patients list');
        } finally {
            setLoading(false);
        }
    };

    const fetchHospitalFacilities = async () => {
        try {
            const res = await hospitalAPI.getMyHospital();
            if (res.success && res.hospital && res.hospital.facilities) {
                setHospitalFacilities(res.hospital.facilities);
            }
        } catch (err) {
            console.error('Error fetching facilities:', err);
        }
    };

    const handleSelectPatient = async (p) => {
        setSelectedPatient(p);
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const res = await billingAPI.getPatientBills(p.mrn || p.patientId || p.phone || p._id);
            if (res.success) {
                setPatientInfo(res.patient);
                setBillingData(res.billing || { appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
            }
        } catch (err) {
            console.error('Error fetching patient bills:', err);
            setError(err.response?.data?.message || 'Error finding patient or bills');
            setPatientInfo(null);
            setBillingData({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [], admissions: [] });
        } finally {
            setLoading(false);
        }
    };

    const handleFacilitySelect = (e) => {
        const facName = e.target.value;
        const fac = hospitalFacilities.find(f => f.name === facName);
        if (fac) {
            setFacilityForm({ ...facilityForm, name: fac.name, pricePerDay: fac.pricePerDay });
        } else {
            setFacilityForm({ name: '', pricePerDay: '', days: '' });
        }
    };

    const handleAddFacilityCharge = async (e) => {
        e.preventDefault();
        if (!patientInfo) return;
        setAddingFacility(true);
        setError('');

        try {
            const data = {
                patientId: patientInfo._id,
                facilityName: facilityForm.name,
                pricePerDay: facilityForm.pricePerDay,
                days: facilityForm.days
            };
            const res = await billingAPI.addFacilityCharge(data);
            if (res.success) {
                setSuccess('Facility charge added to bill.');
                setFacilityForm({ name: '', pricePerDay: '', days: '' });
                // Refresh billing details
                if (selectedPatient) handleSelectPatient(selectedPatient);
                fetchPatientsList();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error adding facility charge');
        } finally {
            setAddingFacility(false);
        }
    };

    const handlePayment = async () => {
        if (!patientInfo) return;
        setProcessingPayment(true);
        setError('');

        const appointmentIds = pendingAppointments.map(a => a._id);
        const labReportIds = pendingLab.map(l => l._id);
        const pharmacyOrderIds = pendingPharmacy.map(p => p._id);
        const facilityChargeIds = pendingFacilities.map(f => f._id);
        const admissionIds = pendingAdmissions.map(a => a._id);

        try {
            const res = await billingAPI.processPayment({
                appointmentIds,
                labReportIds,
                pharmacyOrderIds,
                facilityChargeIds,
                admissionIds,
                paymentMode
            });
            if (res.success) {
                setSuccess('Payment processed successfully. Items marked as Paid.');
                // Refresh billing details
                if (selectedPatient) handleSelectPatient(selectedPatient);
                fetchPatientsList();
            }
        } catch (err) {
            console.error('Payment error:', err);
            setError('Error processing payment');
        } finally {
            setProcessingPayment(false);
        }
    };

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    // Filter items by payment status
    const pendingAppointments = (billingData.appointments || []).filter(a => !['Paid', 'paid'].includes(a.paymentStatus));
    const pendingLab = (billingData.labReports || []).filter(l => !['PAID', 'Paid', 'paid'].includes(l.paymentStatus));
    const pendingPharmacy = (billingData.pharmacyOrders || []).filter(p => !['Paid', 'paid'].includes(p.paymentStatus));
    const pendingFacilities = (billingData.facilityCharges || []).filter(f => !['Paid', 'paid'].includes(f.paymentStatus));
    const pendingAdmissions = (billingData.admissions || []).filter(a => !['Paid', 'paid'].includes(a.paymentStatus));

    const paidAppointments = (billingData.appointments || []).filter(a => ['Paid', 'paid'].includes(a.paymentStatus));
    const paidLab = (billingData.labReports || []).filter(l => ['PAID', 'Paid', 'paid'].includes(l.paymentStatus));
    const paidPharmacy = (billingData.pharmacyOrders || []).filter(p => ['Paid', 'paid'].includes(p.paymentStatus));
    const paidFacilities = (billingData.facilityCharges || []).filter(f => ['Paid', 'paid'].includes(f.paymentStatus));
    const paidAdmissions = (billingData.admissions || []).filter(a => ['Paid', 'paid'].includes(a.paymentStatus));

    // Dues totals
    const totalAppointments = pendingAppointments.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalLab = pendingLab.reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalPharmacy = pendingPharmacy.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalFacilities = pendingFacilities.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const totalAdmissions = pendingAdmissions.reduce((sum, a) => sum + (a.totalAmount || 0), 0);
    const grandTotal = totalAppointments + totalLab + totalPharmacy + totalFacilities + totalAdmissions;

    // Paid totals (History)
    const paidTotalAppointments = paidAppointments.reduce((sum, a) => sum + (a.amount || 0), 0);
    const paidTotalLab = paidLab.reduce((sum, l) => sum + (l.amount || 0), 0);
    const paidTotalPharmacy = paidPharmacy.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const paidTotalFacilities = paidFacilities.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const paidTotalAdmissions = paidAdmissions.reduce((sum, a) => sum + (a.totalAmount || 0), 0);
    const totalPaidSum = paidTotalAppointments + paidTotalLab + paidTotalPharmacy + paidTotalFacilities + paidTotalAdmissions;

    return (
        <div className="cashier-dashboard">
            <div className="cashier-header">
                <h1>Billing Executive Dashboard</h1>
                <p style={{ color: '#64748b' }}>Manage patient dues, add dynamic ward/room charges, and record payments.</p>
            </div>

            {error && <div className="error-message" style={{ marginBottom: '20px' }}>⚠️ {error}</div>}
            {success && <div className="success-message" style={{ marginBottom: '20px' }}>✅ {success}</div>}

            <div className="dashboard-layout-grid">
                {/* LEFT: Patients list sidebar */}
                <div className="patients-sidebar">
                    <input 
                        type="text" 
                        placeholder="🔍 Search name, phone, MRN..." 
                        value={sidebarSearch}
                        onChange={e => setSidebarSearch(e.target.value)}
                        className="sidebar-search-box"
                    />
                    <div className="patients-list-wrapper">
                        {loading && patients.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Loading patients...</div>
                        ) : filteredPatients.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No patients found</div>
                        ) : (
                            filteredPatients.map(p => (
                                <div 
                                    key={p._id}
                                    className={`patient-list-item ${selectedPatient?._id === p._id ? 'selected' : ''}`}
                                    onClick={() => handleSelectPatient(p)}
                                >
                                    <div className="patient-list-name">{p.name}</div>
                                    <div className="patient-list-meta">MRN: {p.mrn || 'N/A'} | Mob: {p.phone || 'N/A'}</div>
                                    <div className="patient-list-dues">
                                        {p.pendingDues > 0 ? (
                                            <span className="badge-dues">Dues: {formatCurrency(p.pendingDues)}</span>
                                        ) : (
                                            <span className="badge-settled">Settled</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT: Patient details and billing tabs */}
                <div className="dashboard-details-section">
                    {patientInfo ? (
                        <>
                            {/* Patient Demographics Header */}
                            <div className="patient-info-card" style={{ borderLeftColor: grandTotal > 0 ? '#ef4444' : '#10b981' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#0f172a' }}>{patientInfo.name}</h2>
                                    <div style={{ color: '#475569', fontSize: '14px' }}>
                                        <strong>MRN:</strong> {patientInfo.mrn || 'N/A'} &nbsp; | &nbsp; 
                                        <strong>Phone:</strong> {patientInfo.phone || 'N/A'} &nbsp; | &nbsp;
                                        <strong>Gender:</strong> {patientInfo.gender || 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Metrics Summary Cards */}
                            <div className="metrics-row">
                                <div className="metric-box" style={{ borderTopColor: '#ef4444' }}>
                                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#ef4444' }}>{formatCurrency(grandTotal)}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 'bold' }}>PENDING DUES</div>
                                </div>
                                <div className="metric-box" style={{ borderTopColor: '#10b981' }}>
                                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#10b981' }}>{formatCurrency(totalPaidSum)}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 'bold' }}>TOTAL PAID</div>
                                </div>
                                <div className="metric-box" style={{ borderTopColor: grandTotal > 0 ? '#f59e0b' : '#10b981' }}>
                                    <div style={{ fontSize: '16px', fontWeight: '800', color: grandTotal > 0 ? '#f59e0b' : '#10b981', textTransform: 'uppercase' }}>
                                        {grandTotal > 0 ? '🔴 Pending Payment' : '🟢 Settle / Clear'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 'bold' }}>BILLING STATUS</div>
                                </div>
                            </div>

                            {/* Dues vs History Navigation Tabs */}
                            <div className="tab-buttons-container">
                                <button 
                                    className={`tab-btn ${activeTab === 'dues' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('dues')}
                                >
                                    🧾 Outstanding Dues ({formatCurrency(grandTotal)})
                                </button>
                                <button 
                                    className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('history')}
                                >
                                    📜 Payment History ({formatCurrency(totalPaidSum)})
                                </button>
                            </div>

                            {activeTab === 'dues' ? (
                                <div className="billing-grid">
                                    <div className="billing-details">
                                        {/* ADD ROOM/FACILITY CHARGE */}
                                        {(currentUser?.permissions?.includes('billing_manage') || ['superadmin', 'hospitaladmin', 'cashier'].includes((currentUser?.role||'').toLowerCase())) && (
                                            <form className="add-facility-form" onSubmit={handleAddFacilityCharge}>
                                                <div className="form-group">
                                                    <label>Add Room / Facility Usage</label>
                                                    <select value={facilityForm.name} onChange={handleFacilitySelect} required>
                                                        <option value="">-- Select Facility --</option>
                                                        {hospitalFacilities.map((fac, i) => (
                                                            <option key={i} value={fac.name}>{fac.name} ({formatCurrency(fac.pricePerDay)}/day)</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="form-group" style={{ maxWidth: '100px' }}>
                                                    <label>Days</label>
                                                    <input 
                                                        type="number" 
                                                        min="1" 
                                                        value={facilityForm.days} 
                                                        onChange={(e) => setFacilityForm({ ...facilityForm, days: e.target.value })} 
                                                        required 
                                                    />
                                                </div>
                                                <button type="submit" disabled={addingFacility || !facilityForm.name}>
                                                    {addingFacility ? 'Adding...' : '+ Add Charge'}
                                                </button>
                                            </form>
                                        )}

                                        {/* WARD / ADMISSION DUES */}
                                        {pendingAdmissions.length > 0 && (
                                            <div className="billing-section">
                                                <h3>🛏️ Hospital Ward & Room Charges</h3>
                                                <table className="bill-items-table">
                                                    <thead><tr><th>Ward</th><th>Beds</th><th>Date Admitted</th><th>Days / Details</th><th>Amount</th></tr></thead>
                                                    <tbody>
                                                        {pendingAdmissions.map((adm) => {
                                                            const isICU = adm.ward?.toUpperCase()?.startsWith('ICU');
                                                            return (
                                                                <tr key={adm._id}>
                                                                    <td>
                                                                        {adm.ward} {isICU && <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '11px', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px' }}>ICU</span>}
                                                                    </td>
                                                                    <td>Bed {adm.bedNumber || 'N/A'}</td>
                                                                    <td>{new Date(adm.admissionDate).toLocaleDateString()}</td>
                                                                    <td>
                                                                        {adm.selectedFacilities?.map((f, i) => (
                                                                            <div key={i} style={{ fontSize: '11px', color: '#64748b' }}>
                                                                                {f.facilityName} ({f.days} days @ {formatCurrency(f.pricePerDay)}/day)
                                                                            </div>
                                                                        ))}
                                                                    </td>
                                                                    <td style={{ fontWeight: '700', color: '#ef4444' }}>{formatCurrency(adm.totalAmount)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* FACILITY CHARGES */}
                                        {pendingFacilities.length > 0 && (
                                            <div className="billing-section">
                                                <h3>🛌 Other Room / Facility Charges</h3>
                                                <table className="bill-items-table">
                                                    <thead><tr><th>Facility Name</th><th>Usage Days</th><th>Price / Day</th><th>Total Dues</th></tr></thead>
                                                    <tbody>
                                                        {pendingFacilities.map((f) => (
                                                            <tr key={f._id}>
                                                                <td>{f.facilityName}</td>
                                                                <td>{f.days} Days</td>
                                                                <td>{formatCurrency(f.pricePerDay)}</td>
                                                                <td style={{ fontWeight: '700', color: '#ef4444' }}>{formatCurrency(f.totalAmount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* CONSULTATIONS */}
                                        {pendingAppointments.length > 0 && (
                                            <div className="billing-section">
                                                <h3>👨‍⚕️ Consultations & Services</h3>
                                                <table className="bill-items-table">
                                                    <thead><tr><th>Date</th><th>Doctor / Service</th><th>Type</th><th>Total</th></tr></thead>
                                                    <tbody>
                                                        {pendingAppointments.map((a) => (
                                                            <tr key={a._id}>
                                                                <td>{new Date(a.appointmentDate).toLocaleDateString()}</td>
                                                                <td>{a.doctorName || 'General Consultation'}</td>
                                                                <td>{a.serviceName || 'Consultation'}</td>
                                                                <td style={{ fontWeight: '700', color: '#ef4444' }}>{formatCurrency(a.amount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* LAB TESTS */}
                                        {pendingLab.length > 0 && (
                                            <div className="billing-section">
                                                <h3>🧪 Laboratory Tests</h3>
                                                <table className="bill-items-table">
                                                    <thead><tr><th>Date Ordered</th><th>Ordered Test(s)</th><th>Charges</th></tr></thead>
                                                    <tbody>
                                                        {pendingLab.map((l) => (
                                                            <tr key={l._id}>
                                                                <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                                                                <td>{l.testNames?.join(', ')}</td>
                                                                <td style={{ fontWeight: '700', color: '#ef4444' }}>{formatCurrency(l.amount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* PHARMACY */}
                                        {pendingPharmacy.length > 0 && (
                                            <div className="billing-section">
                                                <h3>💊 Pharmacy Dispenses</h3>
                                                <table className="bill-items-table">
                                                    <thead><tr><th>Date Dispensed</th><th>Items Description</th><th>Dues</th></tr></thead>
                                                    <tbody>
                                                        {pendingPharmacy.map((p) => (
                                                            <tr key={p._id}>
                                                                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                                                                <td>{p.items?.map(i => `${i.medicineName} (${i.duration})`).join(', ')}</td>
                                                                <td style={{ fontWeight: '700', color: '#ef4444' }}>{formatCurrency(p.totalAmount)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {grandTotal === 0 && (
                                            <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px' }}>
                                                <div style={{ fontSize: '40px', marginBottom: '10px' }}>✓</div>
                                                <h3 style={{ color: '#475569', margin: 0 }}>This patient has no outstanding dues.</h3>
                                            </div>
                                        )}
                                    </div>

                                    {/* Settle Panel */}
                                    <div className="billing-summary">
                                        <div className="summary-card">
                                            <div className="summary-header">
                                                <h3>Settle Bill Payment</h3>
                                            </div>
                                            <div className="summary-body">
                                                <div className="summary-row"><span>Consultations:</span><span>{formatCurrency(totalAppointments)}</span></div>
                                                <div className="summary-row"><span>Lab Dues:</span><span>{formatCurrency(totalLab)}</span></div>
                                                <div className="summary-row"><span>Pharmacy Dues:</span><span>{formatCurrency(totalPharmacy)}</span></div>
                                                <div className="summary-row"><span>Facilities & Ward:</span><span>{formatCurrency(totalFacilities + totalAdmissions)}</span></div>
                                                
                                                <div className="summary-row summary-total">
                                                    <span>Grand Total:</span>
                                                    <span style={{ color: '#ef4444' }}>{formatCurrency(grandTotal)}</span>
                                                </div>

                                                {grandTotal > 0 && (
                                                    <>
                                                        <div style={{ marginTop: '20px' }}>
                                                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: '600', color: '#64748b' }}>Payment Mode</label>
                                                            <select 
                                                                value={paymentMode} 
                                                                onChange={(e) => setPaymentMode(e.target.value)}
                                                                style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none' }}
                                                            >
                                                                <option value="Cash">Cash</option>
                                                                <option value="Card">Card</option>
                                                                <option value="UPI">UPI</option>
                                                                <option value="NetBanking">NetBanking</option>
                                                            </select>
                                                        </div>

                                                        <button 
                                                            className="pay-btn" 
                                                            onClick={handlePayment}
                                                            disabled={processingPayment}
                                                        >
                                                            {processingPayment ? 'Settle Payment...' : `Confirm Settle & Record Paid (${formatCurrency(grandTotal)})`}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* PAYMENT HISTORY TAB */
                                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                                    <h3>📜 Settle Payment History (Completed Collections)</h3>
                                    
                                    {totalPaidSum === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                                            No payment records found for this patient.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {/* Ward/Admission history */}
                                            {paidAdmissions.length > 0 && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>🛏️ Hospital Ward History</h4>
                                                    <table className="bill-items-table">
                                                        <thead><tr><th>Ward</th><th>Beds</th><th>Days / Details</th><th>Amount Paid</th><th>Status</th></tr></thead>
                                                        <tbody>
                                                            {paidAdmissions.map(adm => (
                                                                <tr key={adm._id}>
                                                                    <td>{adm.ward}</td>
                                                                    <td>Bed {adm.bedNumber}</td>
                                                                    <td>
                                                                        {adm.selectedFacilities?.map((f, i) => (
                                                                            <div key={i} style={{ fontSize: '11px', color: '#64748b' }}>
                                                                                {f.facilityName} ({f.days} days @ {formatCurrency(f.pricePerDay)}/day)
                                                                            </div>
                                                                        ))}
                                                                    </td>
                                                                    <td><strong style={{ color: '#10b981' }}>{formatCurrency(adm.totalAmount)}</strong></td>
                                                                    <td><span className="badge-settled">Paid</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* Facility history */}
                                            {paidFacilities.length > 0 && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>🛌 Room & Facility History</h4>
                                                    <table className="bill-items-table">
                                                        <thead><tr><th>Facility</th><th>Usage Days</th><th>Price / Day</th><th>Amount Paid</th><th>Status</th></tr></thead>
                                                        <tbody>
                                                            {paidFacilities.map(f => (
                                                                <tr key={f._id}>
                                                                    <td>{f.facilityName}</td>
                                                                    <td>{f.days} Days</td>
                                                                    <td>{formatCurrency(f.pricePerDay)}</td>
                                                                    <td><strong style={{ color: '#10b981' }}>{formatCurrency(f.totalAmount)}</strong></td>
                                                                    <td><span className="badge-settled">Paid</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* Consult history */}
                                            {paidAppointments.length > 0 && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>👨‍⚕️ Consultation History</h4>
                                                    <table className="bill-items-table">
                                                        <thead><tr><th>Date</th><th>Doctor / Service</th><th>Method</th><th>Paid</th><th>Status</th></tr></thead>
                                                        <tbody>
                                                            {paidAppointments.map(a => (
                                                                <tr key={a._id}>
                                                                    <td>{new Date(a.appointmentDate).toLocaleDateString()}</td>
                                                                    <td>{a.doctorName} ({a.serviceName || 'Consultation'})</td>
                                                                    <td>{a.paymentMode || 'Cash'}</td>
                                                                    <td><strong style={{ color: '#10b981' }}>{formatCurrency(a.amount)}</strong></td>
                                                                    <td><span className="badge-settled">Paid</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* Lab history */}
                                            {paidLab.length > 0 && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>🧪 Laboratory Tests History</h4>
                                                    <table className="bill-items-table">
                                                        <thead><tr><th>Date</th><th>Tests</th><th>Method</th><th>Paid</th><th>Status</th></tr></thead>
                                                        <tbody>
                                                            {paidLab.map(l => (
                                                                <tr key={l._id}>
                                                                    <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                                                                    <td>{l.testNames?.join(', ')}</td>
                                                                    <td>{l.paymentMode || 'Cash'}</td>
                                                                    <td><strong style={{ color: '#10b981' }}>{formatCurrency(l.amount)}</strong></td>
                                                                    <td><span className="badge-settled">Paid</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {/* Pharmacy history */}
                                            {paidPharmacy.length > 0 && (
                                                <div>
                                                    <h4 style={{ margin: '0 0 10px 0', color: '#475569' }}>💊 Pharmacy Orders History</h4>
                                                    <table className="bill-items-table">
                                                        <thead><tr><th>Date</th><th>Medicines</th><th>Paid</th><th>Status</th></tr></thead>
                                                        <tbody>
                                                            {paidPharmacy.map(p => (
                                                                <tr key={p._id}>
                                                                    <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                                                                    <td>{p.items?.map(i => `${i.medicineName}`).join(', ')}</td>
                                                                    <td><strong style={{ color: '#10b981' }}>{formatCurrency(p.totalAmount)}</strong></td>
                                                                    <td><span className="badge-settled">Paid</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '80px', background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🧾</div>
                            <h2 style={{ color: '#1e293b', margin: '0 0 10px 0' }}>Billing Executive Dashboard</h2>
                            <p style={{ color: '#64748b', fontSize: '15px' }}>Please select a patient from the sidebar list to view detailed outstanding dues, record facility charges, and view payment history.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CashierDashboard;
