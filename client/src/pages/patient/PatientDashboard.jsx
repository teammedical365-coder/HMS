import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { patientAuthAPI } from '../../utils/api';
import './PatientDashboard.css';

const PatientDashboard = () => {
    const navigate = useNavigate();
    const { branding, hospitalName } = useBranding();
    
    // Core State
    const [patient, setPatient] = useState(null);
    const [profileData, setProfileData] = useState(null);
    const [appointments, setAppointments] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI State
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, appointments, profile, records, bills
    const [showNotif, setShowNotif] = useState(false);
    
    // Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedDoctor, setSelectedDoctor] = useState('All');
    const [sortOrder, setSortOrder] = useState('newest'); // newest, oldest

    // Billing & Payment State
    const [billsData, setBillsData] = useState([]);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [billsSummary, setBillsSummary] = useState({ totalBills: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, totalPayments: 0 });
    const [billsSearch, setBillsSearch] = useState('');
    const [billsCategory, setBillsCategory] = useState('All');
    const [billsStatus, setBillsStatus] = useState('All');
    const [billsFromDate, setBillsFromDate] = useState('');
    const [billsToDate, setBillsToDate] = useState('');
    const [billsSort, setBillsSort] = useState('newest');
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [payingBill, setPayingBill] = useState(null);
    const [payMode, setPayMode] = useState('UPI');
    const [payTxnId, setPayTxnId] = useState('');
    const [payUpiId, setPayUpiId] = useState('');
    const [payCardLast4, setPayCardLast4] = useState('');
    const [payLoading, setPayLoading] = useState(false);

    // Modal State
    const [selectedAppt, setSelectedAppt] = useState(null);
    const [selectedDocPreview, setSelectedDocPreview] = useState(null);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const meRes = await patientAuthAPI.getMe();
            if (meRes.success) {
                setPatient(meRes.user);
                localStorage.setItem('patientUser', JSON.stringify(meRes.user));

                if (meRes.user.registrationStatus === 'Completed') {
                    // Fetch Appointments
                    const apptRes = await patientAuthAPI.getPatientAppointments();
                    if (apptRes.success) {
                        setAppointments(apptRes.appointments);
                    }
                    // Fetch Profile Data
                    const profileRes = await patientAuthAPI.getPatientProfile();
                    if (profileRes.success) {
                        setProfileData(profileRes.profile);
                    }
                    // Fetch Documents
                    const docsRes = await patientAuthAPI.getPatientDocuments();
                    if (docsRes.success) {
                        setDocuments(docsRes.documents);
                    }
                    // Fetch Bills & Payments
                    const billsRes = await patientAuthAPI.getPatientBills();
                    if (billsRes.success) {
                        setBillsData(billsRes.bills || []);
                        setPaymentHistory(billsRes.paymentHistory || []);
                        setBillsSummary(billsRes.summary || { totalBills: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, totalPayments: 0 });
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load dashboard data', error);
            const userStr = localStorage.getItem('patientUser');
            if (userStr) setPatient(JSON.parse(userStr));
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('patientToken');
        localStorage.removeItem('patientUser');
        navigate('/patient');
    };

    const handleCancelAppointment = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this appointment?')) return;
        try {
            const res = await patientAuthAPI.cancelAppointment(id);
            if (res.success) {
                alert('Appointment cancelled successfully.');
                setAppointments(appointments.map(a => a._id === id ? { ...a, status: 'cancelled' } : a));
                setSelectedAppt(null);
            }
        } catch (error) {
            console.error('Cancel error:', error);
            alert(error.response?.data?.message || 'Failed to cancel appointment.');
        }
    };

    const triggerDownload = async (url, fileName) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = fileName || 'document';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch {
            // Fallback to opening in new tab
            window.open(url, '_blank');
        }
    };

    if (loading) {
        return (
            <div className="patient-portal-container">
                <div style={{ color: '#3b82f6', fontWeight: 600 }}>Loading Dashboard...</div>
            </div>
        );
    }

    const isActivated = patient?.registrationStatus === 'Completed';

    // Helpers
    const getUpcomingAppt = () => {
        const upcoming = appointments.filter(a => a.status === 'confirmed' || a.status === 'pending');
        return upcoming.length > 0 ? upcoming[0] : null;
    };

    const mapCategory = (docType) => {
        const dt = (docType || '').toLowerCase().trim();
        if (dt.includes('lab') || dt.includes('investigation') || dt.includes('report')) return 'Lab Reports';
        if (dt.includes('prescription')) return 'Prescriptions';
        if (dt.includes('consent')) return 'Consent Forms';
        if (dt.includes('certificate')) return 'Medical Certificates';
        if (dt.includes('discharge')) return 'Discharge Summary';
        if (dt.includes('bill') || dt.includes('invoice') || dt.includes('receipt') || dt.includes('payment')) return 'Billing Documents';
        return 'Hospital Documents';
    };

    const getDoctorsList = () => {
        const doctors = documents.map(d => d.uploadedBy).filter(Boolean);
        return ['All', ...new Set(doctors)];
    };

    const getFilteredDocs = () => {
        let filtered = [...documents];

        // Search Term
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(d => 
                (d.fileName || '').toLowerCase().includes(term) ||
                (d.uploadedBy || '').toLowerCase().includes(term) ||
                (d.hospital || '').toLowerCase().includes(term)
            );
        }

        // Category Filter
        if (selectedCategory !== 'All') {
            filtered = filtered.filter(d => mapCategory(d.docType) === selectedCategory);
        }

        // Doctor Filter
        if (selectedDoctor !== 'All') {
            filtered = filtered.filter(d => d.uploadedBy === selectedDoctor);
        }

        // Date Range
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            filtered = filtered.filter(d => new Date(d.uploadedAt) >= start);
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(d => new Date(d.uploadedAt) <= end);
        }

        // Sort Order
        filtered.sort((a, b) => {
            const dateA = new Date(a.uploadedAt || 0);
            const dateB = new Date(b.uploadedAt || 0);
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        });

        return filtered;
    };

    // Render Sub-Views
    const renderPendingView = () => (
        <div className="patient-welcome-card">
            <h3>Welcome, {patient?.name || 'Patient'}!</h3>
            <div className="patient-status-badge-container">
                <div className="patient-status-badge">
                    <span className="patient-status-badge-title">Patient Account</span>
                    <span className="patient-status-badge-value status-active">Active</span>
                </div>
                <div className="patient-status-badge">
                    <span className="patient-status-badge-title">Hospital Registration</span>
                    <span className="patient-status-badge-value status-pending">Pending</span>
                </div>
            </div>
            <div className="patient-message-box">
                <p>
                    <strong>Your Patient Account has been created successfully.</strong><br />
                    Your Hospital Registration has not been completed yet. Please complete your first Appointment Booking to activate your Patient Profile.
                </p>
            </div>
            <div className="patient-dashboard-actions">
                <button className="patient-btn-book" onClick={() => navigate('/patient/book-appointment')}>
                    Book Appointment
                </button>
                <button className="patient-btn-logout" onClick={handleLogout}>
                    Logout Account
                </button>
            </div>
        </div>
    );

    const renderDashboardHome = () => {
        const upcoming = getUpcomingAppt();
        return (
            <div className="activated-dashboard-container">
                <div className="patient-profile-hero">
                    <div className="patient-hero-content">
                        <h2>Welcome back, {patient?.name?.split(' ')[0] || 'Patient'}!</h2>
                        
                        {upcoming ? (
                            <div className="hero-upcoming-appt">
                                <div>
                                    <span className="upcoming-label">Next Appointment</span>
                                    <h4 className="upcoming-doctor">Dr. {upcoming.doctorName}</h4>
                                    <div className="upcoming-time">
                                        <span>📅 {new Date(upcoming.appointmentDate).toLocaleDateString()}</span>
                                        <span>⏰ {upcoming.appointmentTime}</span>
                                    </div>
                                </div>
                                <div className={`appt-status ${upcoming.status.toLowerCase()}`}>
                                    {upcoming.status}
                                </div>
                            </div>
                        ) : (
                            <div className="patient-hero-mrn">
                                <span>MRN:</span> {patient?.mrn || 'Pending'}
                            </div>
                        )}
                    </div>
                    <div className="patient-hero-actions">
                        {!upcoming && (
                            <div className="patient-hero-mrn" style={{ marginBottom: '1rem' }}>
                                <span>MRN:</span> {patient?.mrn || 'Pending'}
                            </div>
                        )}
                        <button className="btn-solid-white" onClick={() => navigate('/patient/book-appointment')}>
                            + New Appointment
                        </button>
                    </div>
                </div>

                <div className="quick-actions-grid">
                    <div className="quick-action-card" onClick={() => setActiveTab('appointments')}>
                        <div className="qa-icon appointments">📅</div>
                        <div className="qa-content">
                            <h3>My Appointments</h3>
                            <p>{appointments.length} total visits</p>
                        </div>
                    </div>
                    <div className="quick-action-card" onClick={() => setActiveTab('records')}>
                        <div className="qa-icon records">📄</div>
                        <div className="qa-content">
                            <h3>Medical Records</h3>
                            <p>{documents.length} files available</p>
                        </div>
                    </div>
                    <div className="quick-action-card" onClick={() => setActiveTab('bills')}>
                        <div className="qa-icon bills">💳</div>
                        <div className="qa-content">
                            <h3>Bills & Payments</h3>
                            <p>Invoices & receipts</p>
                        </div>
                    </div>
                    <div className="quick-action-card" onClick={() => setActiveTab('profile')}>
                        <div className="qa-icon profile">👤</div>
                        <div className="qa-content">
                            <h3>My Profile</h3>
                            <p>Personal details & MRN</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderAppointmentsList = () => (
        <div className="dashboard-card">
            <div className="card-body">
                <div className="section-header">
                    <h2>My Appointments</h2>
                    <button className="patient-btn-book" onClick={() => navigate('/patient/book-appointment')}>
                        Book New
                    </button>
                </div>

                {appointments.length > 0 ? (
                    <div className="appointment-list-full">
                        {appointments.map(appt => {
                            const d = new Date(appt.appointmentDate);
                            return (
                                <div key={appt._id} className="appointment-item-full">
                                    <div className="appt-info-main">
                                        <div className="appt-date-box">
                                            <span className="month">{d.toLocaleString('default', { month: 'short' })}</span>
                                            <span className="day">{d.getDate()}</span>
                                        </div>
                                        <div className="appt-details-full">
                                            <h4>Dr. {appt.doctorName}</h4>
                                            <div className="appt-meta">
                                                <span>{appt.department || 'Consultation'}</span>
                                                <span>•</span>
                                                <span>{appt.appointmentTime}</span>
                                                <span>•</span>
                                                <span className={`appt-status ${appt.status.toLowerCase()}`}>{appt.status}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="appt-actions">
                                        <button className="btn-secondary" onClick={() => setSelectedAppt(appt)}>
                                            View Details
                                        </button>
                                        {(appt.status === 'pending' || appt.status === 'confirmed') && (
                                            <button className="btn-danger-outline" onClick={() => handleCancelAppointment(appt._id)}>
                                                Cancel
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state-large">
                        <div className="icon">📅</div>
                        <h3>No Appointments Found</h3>
                        <p>You haven't booked any appointments yet.</p>
                    </div>
                )}
            </div>
        </div>
    );

    const renderMedicalRecords = () => {
        const filtered = getFilteredDocs();
        const doctors = getDoctorsList();
        const categories = [
            'All', 
            'Lab Reports', 
            'Prescriptions', 
            'Hospital Documents', 
            'Consent Forms', 
            'Medical Certificates', 
            'Discharge Summary', 
            'Billing Documents'
        ];

        return (
            <div>
                {/* Filters */}
                <div className="records-filters-container">
                    <div className="filters-grid">
                        <div className="filter-item">
                            <label>Search</label>
                            <input 
                                type="text" 
                                className="filter-input" 
                                placeholder="Search by name, doctor..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="filter-item">
                            <label>Category</label>
                            <select 
                                className="filter-select"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="filter-item">
                            <label>Doctor/Uploaded By</label>
                            <select 
                                className="filter-select"
                                value={selectedDoctor}
                                onChange={(e) => setSelectedDoctor(e.target.value)}
                            >
                                {doctors.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="filter-item">
                            <label>Start Date</label>
                            <input 
                                type="date" 
                                className="filter-input"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="filter-item">
                            <label>End Date</label>
                            <input 
                                type="date" 
                                className="filter-input"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className="filter-item">
                            <label>Sort By</label>
                            <select 
                                className="filter-select"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                            >
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Grid */}
                {filtered.length > 0 ? (
                    <div className="documents-grid">
                        {filtered.map((doc, idx) => {
                            const mappedCat = mapCategory(doc.docType);
                            const categoryClass = mappedCat.toLowerCase().replace(/\s+/g, '-');
                            
                            // Determine file icon
                            let fileIcon = '📄';
                            if (doc.mimeType?.includes('pdf') || doc.url?.endsWith('.pdf')) fileIcon = '📕';
                            else if (doc.mimeType?.startsWith('image/') || doc.url?.match(/\.(jpeg|jpg|png|gif)$/i)) fileIcon = '🖼️';

                            return (
                                <div key={doc.fileId || idx} className="document-card">
                                    <div>
                                        <div className="doc-header">
                                            <div className="doc-type-icon">{fileIcon}</div>
                                            <div className="doc-title-area">
                                                <h4>{doc.fileName || 'Unnamed Document'}</h4>
                                                <span className={`doc-category-badge ${categoryClass}`}>
                                                    {mappedCat}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="doc-metadata-fields">
                                            <div className="doc-meta-row">
                                                <span className="label">Uploaded By:</span>
                                                <span className="value">{doc.uploadedBy || 'Hospital Staff'}</span>
                                            </div>
                                            <div className="doc-meta-row">
                                                <span className="label">Upload Date:</span>
                                                <span className="value">
                                                    {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'N/A'}
                                                </span>
                                            </div>
                                            <div className="doc-meta-row">
                                                <span className="label">Hospital:</span>
                                                <span className="value">{doc.hospital || hospitalName || 'Our Hospital'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="doc-card-actions">
                                        <button 
                                            className="doc-btn-view" 
                                            onClick={() => setSelectedDocPreview(doc)}
                                        >
                                            👁️ View
                                        </button>
                                        <button 
                                            className="doc-btn-download" 
                                            onClick={() => triggerDownload(doc.url, doc.fileName)}
                                        >
                                            📥 Download
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state-large">
                        <div className="icon">📄</div>
                        <h3>No Medical Records Available</h3>
                        <p>No documents found matching your filter criteria.</p>
                    </div>
                )}
            </div>
        );
    };

    const renderProfile = () => (
        <div className="dashboard-card">
            <div className="card-body">
                <div className="section-header">
                    <h2>My Profile</h2>
                </div>
                {profileData ? (
                    <div className="profile-grid">
                        <div className="profile-section">
                            <h3>Basic Information</h3>
                            <div className="profile-field">
                                <label>Patient Name</label>
                                <div className="value">{profileData.name}</div>
                            </div>
                            <div className="profile-field">
                                <label>MRN (Medical Record Number)</label>
                                <div className="value">{profileData.mrn || profileData.patientId}</div>
                            </div>
                            <div className="profile-field">
                                <label>Age & Gender</label>
                                <div className="value">{profileData.age} Years • {profileData.gender}</div>
                            </div>
                            <div className="profile-field">
                                <label>Blood Group</label>
                                <div className="value">{profileData.bloodGroup || 'Not Specified'}</div>
                            </div>
                        </div>
                        <div className="profile-section">
                            <h3>Contact Information</h3>
                            <div className="profile-field">
                                <label>Mobile Number</label>
                                <div className="value">{profileData.mobile}</div>
                            </div>
                            <div className="profile-field">
                                <label>Email Address</label>
                                <div className="value">{profileData.email || 'Not Provided'}</div>
                            </div>
                            <div className="profile-field">
                                <label>Address</label>
                                <div className="value">{profileData.address || 'Not Provided'}</div>
                            </div>
                            <div className="profile-field">
                                <label>Emergency Contact</label>
                                <div className="value">
                                    {profileData.emergencyContact?.name || 'Not Provided'} 
                                    {profileData.emergencyContact?.phone ? ` (${profileData.emergencyContact.phone})` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>Loading profile...</div>
                )}
            </div>
        </div>
    );

    const refreshBillsData = async () => {
        try {
            const billsRes = await patientAuthAPI.getPatientBills();
            if (billsRes.success) {
                setBillsData(billsRes.bills || []);
                setPaymentHistory(billsRes.paymentHistory || []);
                setBillsSummary(billsRes.summary || { totalBills: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0, totalPayments: 0 });
            }
        } catch (err) {
            console.error('Failed to refresh bills data', err);
        }
    };

    const handleOnlinePayment = async (e) => {
        e.preventDefault();
        if (!payingBill) return;
        
        let transactionId = payTxnId;
        if (payMode === 'UPI' && !transactionId) transactionId = `UPI-${Date.now().toString().slice(-8)}`;
        if (payMode === 'Card' && !transactionId) transactionId = `CARD-${Date.now().toString().slice(-8)}`;
        if (payMode === 'Bank Transfer' && !transactionId) transactionId = `NEFT-${Date.now().toString().slice(-8)}`;

        try {
            setPayLoading(true);
            const payload = {
                billIds: [payingBill.id],
                paymentMode: payMode,
                transactionId: transactionId,
                upiId: payMode === 'UPI' ? (payUpiId || 'patient@upi') : '',
                cardDetails: payMode === 'Card' ? (payCardLast4 || '1234') : '',
                bankReference: payMode === 'Bank Transfer' ? transactionId : ''
            };
            const res = await patientAuthAPI.payPatientBills(payload);
            if (res.success) {
                alert(res.message || 'Payment processed successfully!');
                setPayingBill(null);
                setPayTxnId('');
                setPayUpiId('');
                setPayCardLast4('');
                await refreshBillsData();
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert(error.response?.data?.message || 'Failed to process payment.');
        } finally {
            setPayLoading(false);
        }
    };

    const getFilteredBills = () => {
        return billsData.filter(b => {
            if (billsSearch) {
                const q = billsSearch.toLowerCase();
                const matchNumber = b.billNumber?.toLowerCase().includes(q);
                const matchCategory = b.category?.toLowerCase().includes(q);
                const matchDetails = b.details?.toLowerCase().includes(q);
                if (!matchNumber && !matchCategory && !matchDetails) return false;
            }
            if (billsCategory !== 'All' && b.category !== billsCategory) return false;
            if (billsStatus !== 'All' && b.status !== billsStatus) return false;
            if (billsFromDate && new Date(b.date) < new Date(billsFromDate)) return false;
            if (billsToDate && new Date(b.date) > new Date(billsToDate + 'T23:59:59')) return false;
            return true;
        }).sort((a, b) => {
            if (billsSort === 'oldest') return new Date(a.date || 0) - new Date(b.date || 0);
            return new Date(b.date || 0) - new Date(a.date || 0);
        });
    };

    const renderBills = () => {
        const filteredBills = getFilteredBills();

        return (
            <div className="dashboard-card">
                <div className="card-body">
                    <div className="section-header">
                        <h2>Bills & Payments</h2>
                    </div>

                    {/* Banner */}
                    <div className="bills-profile-banner">
                        <div className="bills-banner-info">
                            <h3>{patient?.name || 'Patient Portal'}</h3>
                            <div className="bills-banner-meta">
                                <span>MRN: {patient?.mrn || patient?.linkedPatientProfileId || '—'}</span>
                                <span>Hospital: {hospitalName || 'Our Hospital'}</span>
                            </div>
                        </div>
                        <div style={{ fontSize: '2.5rem' }}>🏥</div>
                    </div>

                    {/* Summary Grid */}
                    <div className="bills-summary-grid">
                        <div className="bill-stat-card primary">
                            <div>
                                <div className="bill-stat-label">Total Billed</div>
                                <div className="bill-stat-value">₹{billsSummary.totalAmount || 0}</div>
                            </div>
                            <div className="bill-stat-subtext">{billsSummary.totalBills || 0} invoice(s) generated</div>
                        </div>
                        <div className="bill-stat-card success">
                            <div>
                                <div className="bill-stat-label">Paid Amount</div>
                                <div className="bill-stat-value">₹{billsSummary.paidAmount || 0}</div>
                            </div>
                            <div className="bill-stat-subtext">{billsSummary.totalPayments || 0} transaction(s)</div>
                        </div>
                        <div className="bill-stat-card warning">
                            <div>
                                <div className="bill-stat-label">Balance Due</div>
                                <div className="bill-stat-value" style={{ color: billsSummary.pendingAmount > 0 ? '#d97706' : '#10b981' }}>
                                    ₹{billsSummary.pendingAmount || 0}
                                </div>
                            </div>
                            <div className="bill-stat-subtext">{billsSummary.pendingAmount > 0 ? 'Action required' : 'All clear'}</div>
                        </div>
                        <div className="bill-stat-card info">
                            <div>
                                <div className="bill-stat-label">Payment Receipts</div>
                                <div className="bill-stat-value">{paymentHistory.length}</div>
                            </div>
                            <div className="bill-stat-subtext">Verified hospital receipts</div>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="bills-filter-bar">
                        <div className="bills-search-wrapper">
                            <span className="bills-search-icon">🔍</span>
                            <input
                                type="text"
                                className="bills-search-input"
                                placeholder="Search bill number, service, or details..."
                                value={billsSearch}
                                onChange={(e) => setBillsSearch(e.target.value)}
                            />
                        </div>
                        <select className="bills-select" value={billsCategory} onChange={(e) => setBillsCategory(e.target.value)}>
                            <option value="All">All Categories</option>
                            <option value="Consultation">Consultation</option>
                            <option value="Lab Test">Lab Test</option>
                            <option value="Pharmacy">Pharmacy</option>
                            <option value="Facility Charge">Facility Charge</option>
                            <option value="Admission">Admission</option>
                        </select>
                        <select className="bills-select" value={billsStatus} onChange={(e) => setBillsStatus(e.target.value)}>
                            <option value="All">All Statuses</option>
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                        </select>
                        <input
                            type="date"
                            className="bills-date-input"
                            value={billsFromDate}
                            onChange={(e) => setBillsFromDate(e.target.value)}
                            title="From Date"
                        />
                        <input
                            type="date"
                            className="bills-date-input"
                            value={billsToDate}
                            onChange={(e) => setBillsToDate(e.target.value)}
                            title="To Date"
                        />
                        <select className="bills-select" value={billsSort} onChange={(e) => setBillsSort(e.target.value)}>
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                        </select>
                    </div>

                    {/* My Bills Table */}
                    <div className="bills-section-title">
                        <span>My Hospital Bills ({filteredBills.length})</span>
                    </div>

                    {filteredBills.length === 0 ? (
                        <div className="empty-state-large" style={{ margin: '2rem 0' }}>
                            <div className="icon">💳</div>
                            <h3>No Bills Available</h3>
                            <p>No billing records matched your search filters or you currently have no invoices.</p>
                        </div>
                    ) : (
                        <div className="bills-table-container">
                            <table className="bills-table">
                                <thead>
                                    <tr>
                                        <th>Bill No</th>
                                        <th>Category</th>
                                        <th>Date</th>
                                        <th>Details</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredBills.map(bill => {
                                        const pillClass = bill.category.toLowerCase().replace(/\s+/g, '-');
                                        return (
                                            <tr key={bill.id}>
                                                <td><span className="bill-number-badge">{bill.billNumber}</span></td>
                                                <td><span className={`bill-category-pill ${pillClass}`}>{bill.category}</span></td>
                                                <td>{new Date(bill.date).toLocaleDateString()}</td>
                                                <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={bill.details}>
                                                    {bill.details}
                                                </td>
                                                <td className="bill-amount-text">₹{bill.amount}</td>
                                                <td>
                                                    <span className={`bill-status-pill ${bill.status.toLowerCase()}`}>
                                                        {bill.status === 'Paid' ? '✓ PAID' : '⌛ PENDING'}
                                                    </span>
                                                </td>
                                                <td className="bill-actions-cell">
                                                    <button className="btn-bill-action btn-bill-view" onClick={() => setSelectedInvoice(bill)}>
                                                        <span>👁️</span> View
                                                    </button>
                                                    <button className="btn-bill-action btn-bill-download" onClick={() => {
                                                        setSelectedInvoice(bill);
                                                        setTimeout(() => window.print(), 300);
                                                    }}>
                                                        <span>📥</span> Download
                                                    </button>
                                                    {bill.status === 'Pending' && (
                                                        <button className="btn-bill-action btn-bill-pay" onClick={() => {
                                                            setPayingBill(bill);
                                                            setPayMode('UPI');
                                                            setPayTxnId('');
                                                        }}>
                                                            <span>💳</span> Pay Now
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Payment History Section */}
                    <div className="bills-section-title">
                        <span>Payment History & Receipts ({paymentHistory.length})</span>
                    </div>

                    {paymentHistory.length === 0 ? (
                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                            No payment receipts recorded yet.
                        </div>
                    ) : (
                        <div className="bills-table-container">
                            <table className="bills-table">
                                <thead>
                                    <tr>
                                        <th>Receipt No</th>
                                        <th>Payment Date</th>
                                        <th>Method</th>
                                        <th>Transaction Ref</th>
                                        <th>Amount</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paymentHistory.map(receipt => (
                                        <tr key={receipt.id}>
                                            <td><span className="bill-number-badge" style={{ background: '#f0fdf4', color: '#16a34a' }}>{receipt.receiptNumber}</span></td>
                                            <td>{new Date(receipt.paymentDate).toLocaleDateString()}</td>
                                            <td><strong>{receipt.paymentMode}</strong></td>
                                            <td><code>{receipt.transactionId || receipt.upiId || receipt.bankReference || '—'}</code></td>
                                            <td className="bill-amount-text" style={{ color: '#16a34a' }}>₹{receipt.amount}</td>
                                            <td><span className="bill-status-pill paid">✓ {receipt.status}</span></td>
                                            <td className="bill-actions-cell">
                                                <button className="btn-bill-action btn-bill-view" onClick={() => setSelectedReceipt(receipt)}>
                                                    <span>📄</span> Receipt
                                                </button>
                                                <button className="btn-bill-action btn-bill-download" onClick={() => {
                                                    setSelectedReceipt(receipt);
                                                    setTimeout(() => window.print(), 300);
                                                }}>
                                                    <span>📥</span> Download
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderActiveTabContent = () => {
        if (!isActivated) return renderPendingView();
        
        switch (activeTab) {
            case 'dashboard': return renderDashboardHome();
            case 'appointments': return renderAppointmentsList();
            case 'profile': return renderProfile();
            case 'records': return renderMedicalRecords();
            case 'bills': return renderBills();
            default: return renderDashboardHome();
        }
    };

    return (
        <div className="patient-dashboard-layout">
            {/* Sidebar */}
            <aside className="patient-sidebar">
                <div className="patient-sidebar-logo">
                    {branding?.logoUrl ? (
                        <img src={branding.logoUrl} alt="Hospital Logo" />
                    ) : (
                        <div style={{ fontSize: '1.5rem' }}>🏥</div>
                    )}
                    <span>{hospitalName || 'Our Hospital'}</span>
                </div>

                <nav className="patient-sidebar-nav">
                    <button className={`patient-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <span>📊</span> Dashboard
                    </button>
                    {isActivated && (
                        <>
                            <button className={`patient-nav-item ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>
                                <span>📅</span> My Appointments
                            </button>
                            <button className={`patient-nav-item ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>
                                <span>📄</span> Medical Records
                            </button>
                            <button className={`patient-nav-item ${activeTab === 'bills' ? 'active' : ''}`} onClick={() => setActiveTab('bills')}>
                                <span>💳</span> Bills & Payments
                            </button>
                            <button className={`patient-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                                <span>👤</span> My Profile
                            </button>
                        </>
                    )}
                </nav>

                <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                    <button className="patient-nav-item patient-nav-item-logout" onClick={handleLogout}>
                        <span>🚪</span> Logout
                    </button>
                </div>
            </aside>

            {/* Main Section */}
            <main className="patient-dashboard-main">
                {/* Header */}
                <header className="patient-header">
                    <div className="patient-header-branding">
                        {branding?.logoUrl ? (
                            <img src={branding.logoUrl} alt="Logo" />
                        ) : (
                            <span>🏥</span>
                        )}
                        <h2>{hospitalName || 'Our Hospital'}</h2>
                    </div>

                    <div className="patient-header-actions">
                        {isActivated && (
                            <div className="patient-notification-bell" onClick={() => setShowNotif(!showNotif)}>
                                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"></path>
                                </svg>
                                {appointments.length > 0 && <div className="notification-badge">1</div>}
                                
                                {showNotif && (
                                    <div className="patient-notification-dropdown">
                                        <div className="notif-header">Notifications</div>
                                        <div className="notif-list">
                                            {appointments.length > 0 ? (
                                                <div className="notif-item">
                                                    <div className="notif-icon">✅</div>
                                                    <div className="notif-content">
                                                        <p>Appointment Booked Successfully!</p>
                                                        <span>Dr. {appointments[0].doctorName} on {new Date(appointments[0].appointmentDate).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="notif-item">
                                                    <div className="notif-content">
                                                        <p>No new notifications.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="patient-user-info">
                            <span className="patient-user-name">{patient?.name || 'Patient'}</span>
                            <span className="patient-user-role">
                                {isActivated ? `MRN: ${patient?.mrn || '-'}` : 'Patient Access'}
                            </span>
                        </div>
                    </div>
                </header>

                {/* Body Content */}
                <div className="patient-dashboard-content">
                    {renderActiveTabContent()}
                </div>
            </main>

            {/* Appointment Details Modal */}
            {selectedAppt && (
                <div className="patient-modal-overlay" onClick={() => setSelectedAppt(null)}>
                    <div className="patient-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="patient-modal-header">
                            <h3>Appointment Details</h3>
                            <button className="patient-modal-close" onClick={() => setSelectedAppt(null)}>&times;</button>
                        </div>
                        <div className="patient-modal-body">
                            <div className="detail-grid">
                                <div className="detail-item">
                                    <span className="detail-label">Doctor</span>
                                    <span className="detail-value">Dr. {selectedAppt.doctorName}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Department</span>
                                    <span className="detail-value">{selectedAppt.department || 'Consultation'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Visit Date</span>
                                    <span className="detail-value">{new Date(selectedAppt.appointmentDate).toLocaleDateString()}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Visit Time</span>
                                    <span className="detail-value">{selectedAppt.appointmentTime}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Status</span>
                                    <span className="detail-value" style={{ textTransform: 'capitalize' }}>{selectedAppt.status}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Hospital Name</span>
                                    <span className="detail-value">{hospitalName || 'Our Hospital'}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">MRN</span>
                                    <span className="detail-value">{patient?.mrn}</span>
                                </div>
                                <div className="detail-item">
                                    <span className="detail-label">Reason</span>
                                    <span className="detail-value">{selectedAppt.reason || 'Not Specified'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="patient-modal-footer">
                            <button className="btn-secondary" onClick={() => alert('Re-book functionality will be implemented in a future module.')}>
                                Re-book (Future)
                            </button>
                            {(selectedAppt.status === 'pending' || selectedAppt.status === 'confirmed') && (
                                <button className="btn-danger-outline" onClick={() => handleCancelAppointment(selectedAppt._id)}>
                                    Cancel Visit
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Document Preview Modal */}
            {selectedDocPreview && (
                <div className="patient-modal-overlay" onClick={() => setSelectedDocPreview(null)}>
                    <div className="patient-modal-content" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
                        <div className="patient-modal-header">
                            <h3>Preview Document: {selectedDocPreview.fileName}</h3>
                            <button className="patient-modal-close" onClick={() => setSelectedDocPreview(null)}>&times;</button>
                        </div>
                        <div className="patient-modal-body">
                            {selectedDocPreview.url?.endsWith('.pdf') || selectedDocPreview.mimeType?.includes('pdf') ? (
                                <iframe 
                                    src={`${selectedDocPreview.url}#toolbar=0`} 
                                    className="preview-iframe"
                                    title="PDF Document Preview"
                                />
                            ) : (
                                <div className="preview-image-container">
                                    <img 
                                        src={selectedDocPreview.url} 
                                        alt={selectedDocPreview.fileName} 
                                        className="preview-image"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="patient-modal-footer">
                            <button className="btn-secondary" onClick={() => window.open(selectedDocPreview.url, '_blank')}>
                                🔗 Open in New Tab
                            </button>
                            <button 
                                className="btn-secondary" 
                                onClick={() => {
                                    triggerDownload(selectedDocPreview.url, selectedDocPreview.fileName);
                                    setSelectedDocPreview(null);
                                }}
                            >
                                📥 Download
                            </button>
                            <button className="btn-secondary" onClick={() => setSelectedDocPreview(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice Preview Modal */}
            {selectedInvoice && (
                <div className="patient-modal-overlay" onClick={() => setSelectedInvoice(null)}>
                    <div className="invoice-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="invoice-header">
                            <div>
                                <h2>Hospital Invoice</h2>
                                <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>{hospitalName || 'Our Hospital'}</p>
                            </div>
                            <div className="invoice-header-meta">
                                <div><strong>Invoice No:</strong> {selectedInvoice.billNumber}</div>
                                <div><strong>Date:</strong> {new Date(selectedInvoice.date).toLocaleDateString()}</div>
                                <div style={{ marginTop: '4px' }}>
                                    <span className={`bill-status-pill ${selectedInvoice.status.toLowerCase()}`}>
                                        {selectedInvoice.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="invoice-details-grid">
                            <div className="invoice-detail-item">
                                <strong>Patient Name</strong>
                                <span>{patient?.name}</span>
                            </div>
                            <div className="invoice-detail-item">
                                <strong>MRN / Patient ID</strong>
                                <span>{patient?.mrn || patient?.linkedPatientProfileId || '—'}</span>
                            </div>
                            <div className="invoice-detail-item">
                                <strong>Category</strong>
                                <span>{selectedInvoice.category}</span>
                            </div>
                            <div className="invoice-detail-item">
                                <strong>Contact Email</strong>
                                <span>{patient?.email || '—'}</span>
                            </div>
                        </div>

                        <div className="invoice-items-box">
                            <table className="invoice-items-table">
                                <thead>
                                    <tr>
                                        <th>Description of Service / Item</th>
                                        <th style={{ textAlign: 'right' }}>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>{selectedInvoice.details}</td>
                                        <td style={{ textAlign: 'right', fontWeight: '600' }}>₹{selectedInvoice.amount}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="invoice-total-bar">
                                <span>Total Amount:</span>
                                <span>₹{selectedInvoice.amount}</span>
                            </div>
                        </div>

                        {selectedInvoice.status === 'Paid' ? (
                            <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', padding: '1rem', borderRadius: '10px', textAlign: 'center', fontWeight: '600' }}>
                                ✓ This invoice has been fully paid and settled.
                            </div>
                        ) : (
                            <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', padding: '1rem', borderRadius: '10px', textAlign: 'center', fontWeight: '600' }}>
                                ⌛ Payment is currently pending for this invoice.
                            </div>
                        )}

                        <div className="invoice-footer-actions">
                            <button className="btn-bill-action btn-bill-view close-modal-btn" onClick={() => setSelectedInvoice(null)}>
                                Close Preview
                            </button>
                            <button className="btn-bill-action btn-bill-download close-modal-btn" onClick={() => window.print()}>
                                🖨️ Print / Download PDF
                            </button>
                            {selectedInvoice.status === 'Pending' && (
                                <button className="btn-bill-action btn-bill-pay close-modal-btn" onClick={() => {
                                    setPayingBill(selectedInvoice);
                                    setSelectedInvoice(null);
                                    setPayMode('UPI');
                                    setPayTxnId('');
                                }}>
                                    💳 Pay Online Now
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Receipt Modal */}
            {selectedReceipt && (
                <div className="patient-modal-overlay" onClick={() => setSelectedReceipt(null)}>
                    <div className="receipt-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="invoice-header">
                            <div>
                                <h2>Official Payment Receipt</h2>
                                <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>{hospitalName || 'Our Hospital'}</p>
                            </div>
                            <div className="invoice-header-meta">
                                <div><strong>Receipt No:</strong> {selectedReceipt.receiptNumber}</div>
                                <div><strong>Payment Date:</strong> {new Date(selectedReceipt.paymentDate).toLocaleDateString()}</div>
                                <div style={{ marginTop: '4px' }}>
                                    <span className="bill-status-pill paid">PAID & VERIFIED</span>
                                </div>
                            </div>
                        </div>

                        <div className="invoice-details-grid">
                            <div className="invoice-detail-item">
                                <strong>Received From</strong>
                                <span>{patient?.name}</span>
                            </div>
                            <div className="invoice-detail-item">
                                <strong>MRN / Patient ID</strong>
                                <span>{patient?.mrn || patient?.linkedPatientProfileId || '—'}</span>
                            </div>
                            <div className="invoice-detail-item">
                                <strong>Payment Method</strong>
                                <span>{selectedReceipt.paymentMode}</span>
                            </div>
                            <div className="invoice-detail-item">
                                <strong>Transaction Ref / UPI</strong>
                                <span>{selectedReceipt.transactionId || selectedReceipt.upiId || selectedReceipt.bankReference || '—'}</span>
                            </div>
                            {selectedReceipt.cardDetails && (
                                <div className="invoice-detail-item" style={{ gridColumn: '1 / -1' }}>
                                    <strong>Masked Card Details</strong>
                                    <span>{selectedReceipt.cardDetails}</span>
                                </div>
                            )}
                        </div>

                        <div className="invoice-items-box">
                            <table className="invoice-items-table">
                                <thead>
                                    <tr>
                                        <th>Payment Description</th>
                                        <th style={{ textAlign: 'right' }}>Paid Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>{selectedReceipt.description || 'Settlement of Hospital Bills'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#10b981' }}>₹{selectedReceipt.amount}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <div className="invoice-total-bar" style={{ background: '#10b981' }}>
                                <span>Total Received:</span>
                                <span>₹{selectedReceipt.amount}</span>
                            </div>
                        </div>

                        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#64748b', margin: '1.5rem 0 0.5rem 0' }}>
                            Thank you for your payment. This is a computer-generated receipt and does not require a physical signature.
                        </div>

                        <div className="invoice-footer-actions">
                            <button className="btn-bill-action btn-bill-view close-modal-btn" onClick={() => setSelectedReceipt(null)}>
                                Close
                            </button>
                            <button className="btn-bill-action btn-bill-download close-modal-btn" onClick={() => window.print()}>
                                🖨️ Print / Download Receipt
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Online Payment Modal */}
            {payingBill && (
                <div className="patient-modal-overlay" onClick={() => !payLoading && setPayingBill(null)}>
                    <div className="pay-online-modal-content" onClick={e => e.stopPropagation()}>
                        <h3 className="pay-online-title">Pay Bill Online</h3>
                        <p className="pay-online-subtitle">
                            Settling invoice <strong>{payingBill.billNumber}</strong> for <strong>₹{payingBill.amount}</strong>
                        </p>

                        <div className="pay-mode-tabs">
                            <button type="button" className={`pay-mode-tab ${payMode === 'UPI' ? 'active' : ''}`} onClick={() => setPayMode('UPI')}>
                                UPI / QR
                            </button>
                            <button type="button" className={`pay-mode-tab ${payMode === 'Card' ? 'active' : ''}`} onClick={() => setPayMode('Card')}>
                                Credit / Debit Card
                            </button>
                            <button type="button" className={`pay-mode-tab ${payMode === 'Bank Transfer' ? 'active' : ''}`} onClick={() => setPayMode('Bank Transfer')}>
                                Bank Transfer
                            </button>
                        </div>

                        <form onSubmit={handleOnlinePayment}>
                            {payMode === 'UPI' && (
                                <>
                                    <div className="pay-form-group">
                                        <label>Your UPI ID / VPA</label>
                                        <input
                                            type="text"
                                            className="pay-form-input"
                                            placeholder="e.g. username@okhdfcbank"
                                            value={payUpiId}
                                            onChange={(e) => setPayUpiId(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="pay-form-group">
                                        <label>UPI Transaction ID / UTR (Optional)</label>
                                        <input
                                            type="text"
                                            className="pay-form-input"
                                            placeholder="12-digit UTR number after payment"
                                            value={payTxnId}
                                            onChange={(e) => setPayTxnId(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}

                            {payMode === 'Card' && (
                                <>
                                    <div className="pay-form-group">
                                        <label>Card Number (Last 4 Digits Only)</label>
                                        <input
                                            type="text"
                                            maxLength="4"
                                            pattern="[0-9]{4}"
                                            className="pay-form-input"
                                            placeholder="e.g. 4321"
                                            value={payCardLast4}
                                            onChange={(e) => setPayCardLast4(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="pay-form-group">
                                        <label>Authorization / Transaction Reference</label>
                                        <input
                                            type="text"
                                            className="pay-form-input"
                                            placeholder="Card Auth Code or Txn ID"
                                            value={payTxnId}
                                            onChange={(e) => setPayTxnId(e.target.value)}
                                        />
                                    </div>
                                </>
                            )}

                            {payMode === 'Bank Transfer' && (
                                <div className="pay-form-group">
                                    <label>NEFT / IMPS Reference Number</label>
                                    <input
                                        type="text"
                                        className="pay-form-input"
                                        placeholder="Bank Reference / UTR"
                                        value={payTxnId}
                                        onChange={(e) => setPayTxnId(e.target.value)}
                                        required
                                    />
                                </div>
                            )}

                            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#475569' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span>Billed Amount:</span>
                                    <strong>₹{payingBill.amount}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                                    <span>Online Processing Fee:</span>
                                    <strong>₹0 (FREE)</strong>
                                </div>
                            </div>

                            <button type="submit" className="btn-confirm-online-pay" disabled={payLoading}>
                                {payLoading ? 'Processing Secure Payment...' : `Confirm & Pay ₹${payingBill.amount}`}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                style={{ width: '100%', marginTop: '0.6rem' }}
                                onClick={() => setPayingBill(null)}
                                disabled={payLoading}
                            >
                                Cancel
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientDashboard;
