import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { billingAPI, hospitalAPI } from '../../utils/api';
import './CashierDashboard.css';

const CashierDashboard = () => {
    const navigate = useNavigate();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const [searchInput, setSearchInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [patientInfo, setPatientInfo] = useState(null);
    const [billingData, setBillingData] = useState({
        appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: []
    });

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

    useEffect(() => {
        fetchHospitalFacilities();
    }, []);

    const fetchHospitalFacilities = async () => {
        try {
            const res = await hospitalAPI.getMyHospital();
            if (res.success && res.hospital && res.hospital.facilities) {
                setHospitalFacilities(res.hospital.facilities);
            }
        } catch (err) {
            console.error('Error fetching facilities', err);
        }
    };

    const handleSearch = async (e) => {
        e?.preventDefault();
        if (!searchInput) return;

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const res = await billingAPI.getPatientBills(searchInput);
            if (res.success) {
                setPatientInfo(res.patient);
                setBillingData(res.billing);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error finding patient or bills');
            setPatientInfo(null);
            setBillingData({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [] });
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
                // Refresh bills
                handleSearch();
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

        const appointmentIds = billingData.appointments.map(a => a._id);
        const labReportIds = billingData.labReports.map(l => l._id);
        const pharmacyOrderIds = billingData.pharmacyOrders.map(p => p._id);
        const facilityChargeIds = billingData.facilityCharges.map(f => f._id);

        try {
            const res = await billingAPI.processPayment({
                appointmentIds,
                labReportIds,
                pharmacyOrderIds,
                facilityChargeIds,
                paymentMode
            });
            if (res.success) {
                setSuccess('Payment processed successfully. Items marked as Paid.');
                // Clear bills
                setBillingData({ appointments: [], labReports: [], pharmacyOrders: [], facilityCharges: [] });
            }
        } catch (err) {
            setError('Error processing payment');
        } finally {
            setProcessingPayment(false);
        }
    };

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    // Calculates
    const totalAppointments = billingData.appointments.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalLab = billingData.labReports.reduce((sum, l) => sum + (l.amount || 0), 0);
    const totalPharmacy = billingData.pharmacyOrders.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalFacilities = billingData.facilityCharges.reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const grandTotal = totalAppointments + totalLab + totalPharmacy + totalFacilities;

    const hasBills = grandTotal > 0;

    return (
        <div className="cashier-dashboard">
            <div className="cashier-header">
                <h1>Cashier Dashboard</h1>
                <p style={{ color: '#64748b' }}>Search patient by MRN or Mobile Number to clear pending bills.</p>
            </div>

            <form className="search-section" onSubmit={handleSearch}>
                <div className="search-input">
                    <label>Patient Identifier (MRN or Mobile)</label>
                    <input 
                        type="text" 
                        placeholder="e.g. PAT-123456 or 9876543210" 
                        value={searchInput} 
                        onChange={(e) => setSearchInput(e.target.value)} 
                    />
                </div>
                <button type="submit" disabled={loading} className="search-btn">
                    {loading ? 'Searching...' : '🔍 Search Bills'}
                </button>
            </form>

            {error && <div className="error-message" style={{ marginBottom: '20px' }}>⚠️ {error}</div>}
            {success && <div className="success-message" style={{ marginBottom: '20px' }}>✅ {success}</div>}

            {patientInfo && (
                <div className="patient-info-card">
                    <div>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#0f172a' }}>{patientInfo.name}</h2>
                        <div style={{ color: '#475569', fontSize: '14px' }}>
                            <strong>MRN:</strong> {patientInfo.mrn} &nbsp; | &nbsp; 
                            <strong>Phone:</strong> {patientInfo.phone}
                        </div>
                    </div>
                    {hasBills ? (
                        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
                            Pending Dues: {formatCurrency(grandTotal)}
                        </div>
                    ) : (
                        <div style={{ background: '#dcfce7', color: '#15803d', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>
                            No Pending Dues
                        </div>
                    )}
                </div>
            )}

            {patientInfo && (
                <div className="billing-grid">
                    <div className="billing-details">
                        {/* ======================= ADD FACILITY CHARGE ======================= */}
                        {(currentUser?.permissions?.includes('billing_manage') || ['superadmin', 'hospitaladmin', 'cashier'].includes((currentUser?.role||'').toLowerCase())) && (
                            <form className="add-facility-form" onSubmit={handleAddFacilityCharge}>
                                <div className="form-group">
                                    <label>Add Facility Usage</label>
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
                        
                        {/* ======================= FACILITIES ======================= */}
                        {billingData.facilityCharges.length > 0 && (
                            <div className="billing-section">
                                <h3>🛏️ Facility & Accommodation Charges</h3>
                                <table className="bill-items-table">
                                    <thead><tr><th>Facility</th><th>Days</th><th>Price/Day</th><th>Total</th></tr></thead>
                                    <tbody>
                                        {billingData.facilityCharges.map((cur) => (
                                            <tr key={cur._id}>
                                                <td>{cur.facilityName}</td>
                                                <td>{cur.days} Days</td>
                                                <td>{formatCurrency(cur.pricePerDay)}</td>
                                                <td style={{ fontWeight: '500' }}>{formatCurrency(cur.totalAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ======================= APPOINTMENTS ======================= */}
                        {billingData.appointments.length > 0 && (
                            <div className="billing-section">
                                <h3>👨‍⚕️ Consultations & Services</h3>
                                <table className="bill-items-table">
                                    <thead><tr><th>Date</th><th>Doctor / Service</th><th>Type</th><th>Amount</th></tr></thead>
                                    <tbody>
                                        {billingData.appointments.map((cur) => (
                                            <tr key={cur._id}>
                                                <td>{new Date(cur.appointmentDate).toLocaleDateString()}</td>
                                                <td>{cur.doctorId?.name || cur.serviceId?.name || '-'}</td>
                                                <td>{cur.visitType}</td>
                                                <td style={{ fontWeight: '500' }}>{formatCurrency(cur.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ======================= LAB REPORTS ======================= */}
                        {billingData.labReports.length > 0 && (
                            <div className="billing-section">
                                <h3>🧪 Lab Tests</h3>
                                <table className="bill-items-table">
                                    <thead><tr><th>Date</th><th>Tests</th><th>Amount</th></tr></thead>
                                    <tbody>
                                        {billingData.labReports.map((cur) => (
                                            <tr key={cur._id}>
                                                <td>{new Date(cur.createdAt).toLocaleDateString()}</td>
                                                <td>{cur.tests?.length} Test(s) Ordered</td>
                                                <td style={{ fontWeight: '500' }}>{formatCurrency(cur.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ======================= PHARMACY ======================= */}
                        {billingData.pharmacyOrders.length > 0 && (
                            <div className="billing-section">
                                <h3>💊 Pharmacy & Medicines</h3>
                                <table className="bill-items-table">
                                    <thead><tr><th>Date</th><th>Items</th><th>Total Amount</th></tr></thead>
                                    <tbody>
                                        {billingData.pharmacyOrders.map((cur) => (
                                            <tr key={cur._id}>
                                                <td>{new Date(cur.createdAt).toLocaleDateString()}</td>
                                                <td>{cur.items?.length} Medicine(s) Dispensed</td>
                                                <td style={{ fontWeight: '500' }}>{formatCurrency(cur.totalAmount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        
                        {!hasBills && (
                            <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px' }}>
                                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🧾</div>
                                <h3 style={{ color: '#475569', margin: 0 }}>This patient has no pending bills.</h3>
                            </div>
                        )}

                    </div>

                    <div className="billing-summary">
                        <div className="summary-card">
                            <div className="summary-header">
                                <h3>Payment Summary</h3>
                            </div>
                            <div className="summary-body">
                                <div className="summary-row">
                                    <span>Consultations:</span>
                                    <span>{formatCurrency(totalAppointments)}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Lab Tests:</span>
                                    <span>{formatCurrency(totalLab)}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Pharmacy:</span>
                                    <span>{formatCurrency(totalPharmacy)}</span>
                                </div>
                                <div className="summary-row" style={{ color: '#166534', fontWeight: '500' }}>
                                    <span>Facilities & Rooms:</span>
                                    <span>{formatCurrency(totalFacilities)}</span>
                                </div>

                                <div className="summary-row summary-total">
                                    <span>Grand Total:</span>
                                    <span>{formatCurrency(grandTotal)}</span>
                                </div>

                                {hasBills && (
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
                                            {processingPayment ? 'Processing...' : `Mark as Paid (${formatCurrency(grandTotal)})`}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CashierDashboard;
