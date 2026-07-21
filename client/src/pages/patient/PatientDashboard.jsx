import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '../../context/BrandingContext';
import { patientAuthAPI, uploadAPI } from '../../utils/api';
import SlotPicker from '../../components/SlotPicker';
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
    const [selectedDepartment, setSelectedDepartment] = useState('All Departments');
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
    const [departmentUpi, setDepartmentUpi] = useState(null);
    const [fetchingUpi, setFetchingUpi] = useState(false);

    // Modal State
    const [selectedAppt, setSelectedAppt] = useState(null);
    const [selectedDocPreview, setSelectedDocPreview] = useState(null);
    const [followupData, setFollowupData] = useState(null);
    const [rebookingAppt, setRebookingAppt] = useState(null);
    const [rebookForm, setRebookForm] = useState({ visitDate: '', visitTime: '' });
    const [bookingAppt, setBookingAppt] = useState(false);

    // Profile Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState(null);
    const [updatingProfile, setUpdatingProfile] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    const handleEditClick = () => {
        if (!profileData) return;
        setEditForm({
            name: profileData.name || '',
            email: profileData.email || '',
            mobile: profileData.mobile || profileData.phone || '',
            dob: profileData.dob || '',
            age: profileData.age || '',
            gender: profileData.gender || '',
            bloodGroup: profileData.bloodGroup || '',
            maritalStatus: profileData.maritalStatus || '',
            occupation: profileData.occupation || '',
            nationality: profileData.nationality || '',
            panNumber: profileData.panNumber || '',
            alternateMobile: profileData.alternateMobile || '',
            whatsappNumber: profileData.whatsappNumber || '',
            
            // Emergency Contact
            emergencyContact: {
                name: profileData.emergencyContact?.name || '',
                relation: profileData.emergencyContact?.relation || '',
                mobile: profileData.emergencyContact?.mobile || ''
            },
            
            // Address
            houseNo: profileData.houseNo || '',
            buildingName: profileData.buildingName || '',
            street: profileData.street || '',
            area: profileData.area || '',
            landmark: profileData.landmark || '',
            city: profileData.city || '',
            state: profileData.state || '',
            country: profileData.country || 'India',
            zipCode: profileData.zipCode || '',
            
            // Medical / Fertility Profile
            height: profileData.fertilityProfile?.height || '',
            weight: profileData.fertilityProfile?.weight || '',
            bmi: profileData.fertilityProfile?.bmi || '',
            allergies: profileData.fertilityProfile?.allergies || '',
            chronicDiseases: profileData.fertilityProfile?.chronicDiseases || '',
            medicalHistory: profileData.fertilityProfile?.medicalHistory || '',
            surgicalHistory: profileData.fertilityProfile?.surgicalHistory || '',
            currentMedications: profileData.fertilityProfile?.currentMedications || '',

            avatar: profileData.avatar || ''
        });
        setIsEditing(true);
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploadingAvatar(true);
        try {
            const formData = new FormData();
            formData.append('images', file);
            const res = await uploadAPI.uploadImages(formData);
            if (res.success && res.files?.length > 0) {
                const url = res.files[0].url;
                setEditForm(prev => ({ ...prev, avatar: url }));
                alert('Profile picture uploaded successfully!');
            } else {
                alert('Upload failed. Please try again.');
            }
        } catch (err) {
            console.error('Avatar upload error:', err);
            alert('Failed to upload avatar.');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleProfileInputChange = (e) => {
        const { name, value } = e.target;

        if (name === 'mobile' || name === 'alternateMobile' || name === 'whatsappNumber') {
            const cleaned = value.replace(/\D/g, '').slice(0, 10);
            setEditForm(prev => ({ ...prev, [name]: cleaned }));
            return;
        }

        if (name === 'aadhaarNumber') {
            const cleaned = value.replace(/\D/g, '').slice(0, 12);
            setEditForm(prev => ({ ...prev, [name]: cleaned }));
            return;
        }

        if (name === 'height' || name === 'weight') {
            setEditForm(prev => {
                const h = name === 'height' ? value : prev.height;
                const w = name === 'weight' ? value : prev.weight;
                let bmi = prev.bmi;
                if (h && w) {
                    const hM = Number(h) / 100;
                    bmi = (Number(w) / (hM * hM)).toFixed(2);
                }
                return { ...prev, [name]: value, bmi };
            });
            return;
        }

        setEditForm(prev => ({ ...prev, [name]: value }));
    };

    const handleEmergencyContactChange = (e) => {
        const { name, value } = e.target;
        let val = value;
        if (name === 'mobile') {
            val = value.replace(/\D/g, '').slice(0, 10);
        }
        setEditForm(prev => ({
            ...prev,
            emergencyContact: {
                ...prev.emergencyContact,
                [name]: val
            }
        }));
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        
        if (!editForm.name?.trim()) {
            alert('Name is required.');
            return;
        }

        if (!/^\d{10}$/.test(editForm.mobile)) {
            alert('Mobile number must be exactly 10 digits.');
            return;
        }

        if (editForm.aadhaarNumber && !/^\d{12}$/.test(editForm.aadhaarNumber)) {
            alert('Aadhaar number must be exactly 12 digits.');
            return;
        }

        setUpdatingProfile(true);
        try {
            const res = await patientAuthAPI.updatePatientProfile(editForm);
            if (res.success) {
                alert('Profile updated successfully!');
                setProfileData(res.profile);
                
                const pUserStr = localStorage.getItem('patientUser');
                if (pUserStr) {
                    const pUser = JSON.parse(pUserStr);
                    pUser.name = res.profile.name;
                    pUser.avatar = res.profile.avatar;
                    localStorage.setItem('patientUser', JSON.stringify(pUser));
                }
                
                setIsEditing(false);
            } else {
                alert(res.message || 'Failed to update profile.');
            }
        } catch (err) {
            console.error('Profile update error:', err);
            alert(err.response?.data?.message || 'Failed to save changes.');
        } finally {
            setUpdatingProfile(false);
        }
    };

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
                    // Fetch Followup status
                    try {
                        const followupRes = await patientAuthAPI.getFollowupStatus('auto');
                        if (followupRes.success) {
                            setFollowupData(followupRes);
                        }
                    } catch (err) {
                        console.error('Failed to fetch followup status', err);
                    }
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

    const handleRebookSubmit = async () => {
        if (!rebookForm.visitDate || !rebookForm.visitTime) {
            alert('Please select both date and time.');
            return;
        }
        setBookingAppt(true);
        try {
            const res = await patientAuthAPI.bookAppointment({
                doctorId: rebookingAppt.doctorId,
                department: rebookingAppt.department,
                date: rebookForm.visitDate,
                time: rebookForm.visitTime,
                notes: 'Rebooked appointment via Patient Portal'
            });
            if (res.success) {
                alert('Appointment rebooked successfully!');
                setRebookingAppt(null);
                setRebookForm({ visitDate: '', visitTime: '' });
                loadDashboardData(); // refresh appointments
            }
        } catch (err) {
            console.error('Rebook error:', err);
            alert(err.response?.data?.message || 'Failed to rebook appointment.');
        } finally {
            setBookingAppt(false);
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

    const isActivated = true; // Ensure identical full dashboard across all hospitals

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

    const getDepartmentsList = () => {
        const deptsFromDocs = documents.map(d => d.department).filter(Boolean);
        const deptsFromAppts = appointments.map(a => a.department || a.serviceName).filter(Boolean);
        const unique = [...new Set([...deptsFromDocs, ...deptsFromAppts])];
        if (!unique.includes('General')) unique.push('General');
        return ['All Departments', ...unique.sort()];
    };

    const getFilteredDocs = () => {
        let filtered = [...documents];

        // Department Filter
        if (selectedDepartment && selectedDepartment !== 'All Departments') {
            filtered = filtered.filter(d => (d.department || 'General').toLowerCase() === selectedDepartment.toLowerCase());
        }

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

    const renderFollowupBanner = () => {
        if (!followupData || !followupData.lastConsultation) return null;

        const { active, validUntil, department, fee, lastConsultation } = followupData;
        if (active) {
            const remainingDays = validUntil
                ? Math.max(0, Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 3600 * 24)))
                : 0;

            if (remainingDays === 1) {
                return (
                    <div className="followup-notification-banner warning">
                        <div className="followup-notification-content">
                            <span className="followup-notification-icon">⚠️</span>
                            <span>
                                Your free follow-up consultation in <strong>{department}</strong> expires in{' '}
                                <strong>1 day</strong> ({new Date(validUntil).toLocaleDateString()}). Book now to keep your free consultation!
                            </span>
                        </div>
                        <button
                            className="btn-banner-action"
                            onClick={() => navigate(`/patient/book-appointment?department=${encodeURIComponent(department)}`)}
                        >
                            Book Free Visit
                        </button>
                    </div>
                );
            }
        } else if (lastConsultation && department) {
            return (
                <div className="followup-notification-banner expired">
                    <div className="followup-notification-content">
                        <span className="followup-notification-icon">⚠️</span>
                        <span>
                            Your follow-up window for <strong>{department}</strong> has expired. Next consultation fee is <strong>₹{fee}</strong>.
                        </span>
                    </div>
                    <button
                        className="btn-banner-action"
                        onClick={() => navigate(`/patient/book-appointment?department=${encodeURIComponent(department)}`)}
                    >
                        Book Appointment
                    </button>
                </div>
            );
        }
        return null;
    };

    const renderFollowupCard = () => {
        if (!followupData || !followupData.lastConsultation) return null;

        const { active, validUntil, department, fee, lastConsultation } = followupData;
        const remainingDays = active && validUntil
            ? Math.max(0, Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 3600 * 24)))
            : 0;

        return (
            <div className={`followup-status-card ${active ? 'status-active' : 'status-expired'}`}>
                <div className="followup-card-header">
                    <div className="followup-card-title">
                        <span>🔄</span>
                        <h3>Consultation Follow-up & Validity Status</h3>
                    </div>
                    <span className={`followup-status-badge ${active ? 'badge-active' : 'badge-expired'}`}>
                        {active ? '✓ Active Follow-up' : lastConsultation ? '⚠️ Expired Follow-up' : 'New Patient'}
                    </span>
                </div>

                <div className="followup-card-grid">
                    <div className="followup-info-item">
                        <div className="followup-info-label">Current Department</div>
                        <div className="followup-info-value">{department || 'None'}</div>
                    </div>
                    <div className="followup-info-item">
                        <div className="followup-info-label">Last Consultation</div>
                        <div className="followup-info-value">
                            {lastConsultation ? new Date(lastConsultation).toLocaleDateString('en-IN') : 'Never Visited'}
                        </div>
                    </div>
                    <div className="followup-info-item">
                        <div className="followup-info-label">Validity Remaining</div>
                        <div className="followup-info-value">
                            {active ? (remainingDays === 0 ? 'Expires Today' : `${remainingDays} Day${remainingDays > 1 ? 's' : ''} Left`) : 'No Active Follow-up'}
                        </div>
                    </div>
                    <div className="followup-info-item">
                        <div className="followup-info-label">Consultation Fee</div>
                        <div className={`followup-info-value ${active ? 'free-fee' : ''}`}>
                            {active ? '₹0 (Waived)' : `₹${fee}`}
                        </div>
                    </div>
                </div>

                <div className="followup-card-actions">
                    <span className="followup-action-note">
                        {active
                            ? 'Book within the validity window to consult with your doctor for free.'
                            : 'Validity window has expired. Standard consultation fees apply.'}
                    </span>
                    {active ? (
                        <button
                            className="btn-rebook-primary"
                            onClick={() => navigate(`/patient/book-appointment?department=${encodeURIComponent(department)}`)}
                        >
                            Re-Book Free Consultation
                        </button>
                    ) : (
                        <button
                            className="btn-book-new"
                            onClick={() => navigate('/patient/book-appointment')}
                        >
                            Book Consultation
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderDashboardHome = () => {
        const upcoming = getUpcomingAppt();
        return (
            <div className="activated-dashboard-container">
                {renderFollowupBanner()}
                
                <div className="patient-profile-hero">
                    <div className="patient-hero-content">
                        <h2>Welcome back, {patient?.name?.split(' ')[0] || 'Patient'}!</h2>
                        
                        {upcoming && (
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
                        )}
                    </div>
                    <div className="patient-hero-actions">
                        {patient?.mrn && (
                            <div className="patient-hero-mrn" style={{ marginBottom: '1rem' }}>
                                <span>MRN:</span> {patient.mrn}
                            </div>
                        )}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {renderFollowupBanner()}
            {renderFollowupCard()}

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
                                                    <span className={`visit-type-badge ${appt.amount === 0 || appt.visitType === 'Follow-up' ? 'followup' : 'new-visit'}`}>
                                                        {appt.amount === 0 || appt.visitType === 'Follow-up' ? '🔄 Follow-up' : '🆕 New Visit'}
                                                    </span>
                                                    <span>•</span>
                                                    <span className={`fee-charged-badge ${appt.amount === 0 ? 'waived' : 'charged'}`}>
                                                        {appt.amount === 0 ? '₹0 (Waived)' : `₹${appt.amount}`}
                                                    </span>
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
                            <label>Department</label>
                            <select 
                                className="filter-select"
                                value={selectedDepartment}
                                onChange={(e) => setSelectedDepartment(e.target.value)}
                            >
                                {getDepartmentsList().map(dept => <option key={dept} value={dept}>{dept}</option>)}
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

                {/* Grid or Grouped View */}
                {filtered.length > 0 ? (
                    selectedDepartment !== 'All Departments' ? (
                        (() => {
                            const groupMap = {};
                            filtered.forEach(doc => {
                                const key = doc.appointmentId ? String(doc.appointmentId) : `${new Date(doc.appointmentDate || doc.uploadedAt).toISOString().split('T')[0]}_${doc.doctorName || doc.uploadedBy}`;
                                if (!groupMap[key]) {
                                    groupMap[key] = {
                                        appointmentDate: doc.appointmentDate || doc.uploadedAt,
                                        doctorName: doc.doctorName || doc.uploadedBy || 'Assigned Doctor',
                                        status: doc.appointmentStatus || 'Completed',
                                        docs: []
                                    };
                                }
                                groupMap[key].docs.push(doc);
                            });
                            const groups = Object.values(groupMap);
                            groups.sort((a, b) => {
                                const dA = new Date(a.appointmentDate || 0);
                                const dB = new Date(b.appointmentDate || 0);
                                return sortOrder === 'newest' ? dB - dA : dA - dB;
                            });
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {groups.map((group, gIdx) => (
                                        <div key={gIdx} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', background: '#ffffff', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                                            <div style={{ background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span>📅</span>
                                                        <span>Appointment: {group.appointmentDate ? new Date(group.appointmentDate).toLocaleDateString('default', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</span>
                                                    </div>
                                                    <div style={{ fontSize: '14px', color: '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span>👨‍⚕️</span>
                                                        <span>Doctor: {group.doctorName}</span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px', background: group.status === 'Completed' ? '#dcfce7' : '#fef9c3', color: group.status === 'Completed' ? '#166534' : '#854d0e', border: group.status === 'Completed' ? '1px solid #bbf7d0' : '1px solid #fde047' }}>
                                                        Status: {group.status}
                                                    </span>
                                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#3b82f6', background: '#eff6ff', padding: '4px 12px', borderRadius: '20px', border: '1px solid #dbeafe' }}>
                                                        Reports ({group.docs.length})
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="documents-grid" style={{ padding: '20px' }}>
                                                {group.docs.map((doc, idx) => {
                                                    const mappedCat = mapCategory(doc.docType);
                                                    const categoryClass = mappedCat.toLowerCase().replace(/\s+/g, '-');
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
                                                                        <span className="label">Department:</span>
                                                                        <span className="value">{doc.department || 'General'}</span>
                                                                    </div>
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
                                        </div>
                                    ))}
                                </div>
                            );
                        })()
                    ) : (
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
                                                    <span className="label">Department:</span>
                                                    <span className="value">{doc.department || 'General'}</span>
                                                </div>
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
                    )
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

    const calculateCompleteness = (data) => {
        if (!data) return 0;
        const fields = [
            data.name, data.mrn || data.patientId, data.hospitalName, data.branch, data.registrationDate, data.patientStatus, data.patientType,
            data.dob, data.age, data.gender, data.maritalStatus, data.bloodGroup, data.aadhaarNumber, data.panNumber, data.occupation, data.nationality,
            data.mobile || data.phone, data.alternateMobile, data.whatsappNumber, data.email,
            data.houseNo, data.buildingName, data.street, data.area, data.landmark, data.city, data.state, data.country, data.zipCode,
            data.emergencyContact?.name, data.emergencyContact?.relation, data.emergencyContact?.mobile,
            data.fertilityProfile?.height, data.fertilityProfile?.weight, data.fertilityProfile?.bmi, data.fertilityProfile?.allergies, data.fertilityProfile?.chronicDiseases, data.fertilityProfile?.medicalHistory, data.fertilityProfile?.surgicalHistory, data.fertilityProfile?.currentMedications,
            data.department, data.primaryDoctorName, data.sourceType, data.registrationType
        ];
        const filled = fields.filter(f => f !== undefined && f !== null && f !== '' && (Array.isArray(f) ? f.length > 0 : true)).length;
        return Math.round((filled / fields.length) * 100);
    };

    const renderProfile = () => {
        const completeness = calculateCompleteness(profileData);
        
        if (!profileData) {
            return (
                <div className="profile-loading-container">
                    <div className="profile-spinner"></div>
                    <p>Loading your profile...</p>
                </div>
            );
        }

        const initials = (profileData.name || 'P').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        if (isEditing && editForm) {
            return (
                <div className="dashboard-card profile-edit-card animate-fade-in">
                    <div className="card-body">
                        <form onSubmit={handleSaveProfile}>
                            {/* Header identity card edit mode */}
                            <div className="profile-gradient-header">
                                <div className="profile-header-avatar-section">
                                    <div className="avatar-edit-container">
                                        {editForm.avatar ? (
                                            <img src={editForm.avatar} alt="Avatar" className="profile-large-avatar" />
                                        ) : (
                                            <div className="profile-large-avatar initials-avatar">{initials}</div>
                                        )}
                                        <label className="avatar-upload-overlay" htmlFor="avatar-file-input">
                                            {uploadingAvatar ? (
                                                <div className="spinner-mini"></div>
                                            ) : (
                                                <>
                                                    <span>📷</span>
                                                    <span className="overlay-text">Upload</span>
                                                </>
                                            )}
                                        </label>
                                        <input 
                                            id="avatar-file-input" 
                                            type="file" 
                                            accept="image/*" 
                                            onChange={handleAvatarChange} 
                                            style={{ display: 'none' }} 
                                            disabled={uploadingAvatar}
                                        />
                                    </div>
                                    <div className="profile-header-text">
                                        <h3>Editing Profile</h3>
                                        <p>{editForm.email}</p>
                                    </div>
                                </div>
                                <div className="profile-header-actions">
                                    <button type="submit" className="btn-save-profile" disabled={updatingProfile}>
                                        {updatingProfile ? 'Saving...' : '💾 Save Changes'}
                                    </button>
                                    <button type="button" className="btn-cancel-profile" onClick={() => setIsEditing(false)} disabled={updatingProfile}>
                                        ❌ Cancel
                                    </button>
                                </div>
                            </div>

                            <div className="profile-edit-grid">
                                {/* Section 1: Personal Details */}
                                <div className="profile-edit-section">
                                    <div className="section-title-bar">
                                        <span className="section-icon">👤</span>
                                        <h4>Personal Information</h4>
                                    </div>
                                    <div className="form-fields-grid">
                                        <div className="form-field-group">
                                            <label>Patient Full Name <span className="req">*</span></label>
                                            <input 
                                                type="text" 
                                                name="name" 
                                                value={editForm.name} 
                                                onChange={handleProfileInputChange} 
                                                required 
                                                minLength={2} 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Date of Birth</label>
                                            <input 
                                                type="date" 
                                                name="dob" 
                                                value={editForm.dob ? editForm.dob.split('T')[0] : ''} 
                                                onChange={handleProfileInputChange} 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Age (Years) <span className="req">*</span></label>
                                            <input 
                                                type="number" 
                                                name="age" 
                                                value={editForm.age} 
                                                onChange={handleProfileInputChange} 
                                                required 
                                                min="1" 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Gender</label>
                                            <select name="gender" value={editForm.gender} onChange={handleProfileInputChange}>
                                                <option value="">Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div className="form-field-group">
                                            <label>Blood Group</label>
                                            <select name="bloodGroup" value={editForm.bloodGroup} onChange={handleProfileInputChange}>
                                                <option value="">Select Blood Group</option>
                                                <option value="A+">A+</option>
                                                <option value="A-">A-</option>
                                                <option value="B+">B+</option>
                                                <option value="B-">B-</option>
                                                <option value="AB+">AB+</option>
                                                <option value="AB-">AB-</option>
                                                <option value="O+">O+</option>
                                                <option value="O-">O-</option>
                                            </select>
                                        </div>
                                        <div className="form-field-group">
                                            <label>Marital Status</label>
                                            <select name="maritalStatus" value={editForm.maritalStatus} onChange={handleProfileInputChange}>
                                                <option value="">Select Marital Status</option>
                                                <option value="single">Single</option>
                                                <option value="married">Married</option>
                                                <option value="divorced">Divorced</option>
                                                <option value="widowed">Widowed</option>
                                            </select>
                                        </div>
                                        <div className="form-field-group">
                                            <label>Occupation</label>
                                            <input type="text" name="occupation" value={editForm.occupation} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Nationality</label>
                                            <input type="text" name="nationality" value={editForm.nationality} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Aadhaar Number</label>
                                            <input 
                                                type="text" 
                                                name="aadhaarNumber" 
                                                value={editForm.aadhaarNumber} 
                                                onChange={handleProfileInputChange} 
                                                maxLength={12} 
                                                placeholder="12-digit Aadhaar"
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>PAN Number</label>
                                            <input type="text" name="panNumber" value={editForm.panNumber} onChange={handleProfileInputChange} placeholder="PAN Number" />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 2: Contact Details */}
                                <div className="profile-edit-section">
                                    <div className="section-title-bar">
                                        <span className="section-icon">📞</span>
                                        <h4>Contact Information</h4>
                                    </div>
                                    <div className="form-fields-grid">
                                        <div className="form-field-group">
                                            <label>Mobile Number <span className="req">*</span></label>
                                            <input 
                                                type="text" 
                                                name="mobile" 
                                                value={editForm.mobile} 
                                                onChange={handleProfileInputChange} 
                                                required 
                                                maxLength={10} 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Alternate Mobile</label>
                                            <input 
                                                type="text" 
                                                name="alternateMobile" 
                                                value={editForm.alternateMobile} 
                                                onChange={handleProfileInputChange} 
                                                maxLength={10} 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>WhatsApp Number</label>
                                            <input 
                                                type="text" 
                                                name="whatsappNumber" 
                                                value={editForm.whatsappNumber} 
                                                onChange={handleProfileInputChange} 
                                                maxLength={10} 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Email Address <span className="req">*</span></label>
                                            <input 
                                                type="email" 
                                                name="email" 
                                                value={editForm.email} 
                                                onChange={handleProfileInputChange} 
                                                required 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Emergency Contact */}
                                <div className="profile-edit-section">
                                    <div className="section-title-bar">
                                        <span className="section-icon">🚨</span>
                                        <h4>Emergency Contact</h4>
                                    </div>
                                    <div className="form-fields-grid">
                                        <div className="form-field-group">
                                            <label>Contact Person Name</label>
                                            <input 
                                                type="text" 
                                                name="name" 
                                                value={editForm.emergencyContact?.name || ''} 
                                                onChange={handleEmergencyContactChange} 
                                            />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Relation</label>
                                            <select name="relation" value={editForm.emergencyContact?.relation || ''} onChange={handleEmergencyContactChange}>
                                                <option value="">Select Relation</option>
                                                <option value="Father">Father</option>
                                                <option value="Mother">Mother</option>
                                                <option value="Spouse">Spouse</option>
                                                <option value="Son">Son</option>
                                                <option value="Daughter">Daughter</option>
                                                <option value="Brother">Brother</option>
                                                <option value="Sister">Sister</option>
                                                <option value="Others">Others</option>
                                            </select>
                                        </div>
                                        <div className="form-field-group">
                                            <label>Contact Mobile</label>
                                            <input 
                                                type="text" 
                                                name="mobile" 
                                                value={editForm.emergencyContact?.mobile || ''} 
                                                onChange={handleEmergencyContactChange} 
                                                maxLength={10} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 4: Address Details */}
                                <div className="profile-edit-section">
                                    <div className="section-title-bar">
                                        <span className="section-icon">📍</span>
                                        <h4>Address Details</h4>
                                    </div>
                                    <div className="form-fields-grid">
                                        <div className="form-field-group">
                                            <label>House/Flat No.</label>
                                            <input type="text" name="houseNo" value={editForm.houseNo} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Building Name</label>
                                            <input type="text" name="buildingName" value={editForm.buildingName} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Street</label>
                                            <input type="text" name="street" value={editForm.street} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Area / Locality</label>
                                            <input type="text" name="area" value={editForm.area} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Landmark</label>
                                            <input type="text" name="landmark" value={editForm.landmark} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>City</label>
                                            <input type="text" name="city" value={editForm.city} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>State</label>
                                            <input type="text" name="state" value={editForm.state} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Country</label>
                                            <input type="text" name="country" value={editForm.country} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Pincode / Zip Code</label>
                                            <input type="text" name="zipCode" value={editForm.zipCode} onChange={handleProfileInputChange} />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 5: Medical / Fertility Details */}
                                <div className="profile-edit-section">
                                    <div className="section-title-bar">
                                        <span className="section-icon">🩺</span>
                                        <h4>Medical Information</h4>
                                    </div>
                                    <div className="form-fields-grid">
                                        <div className="form-field-group">
                                            <label>Height (cm)</label>
                                            <input type="number" name="height" value={editForm.height} onChange={handleProfileInputChange} min="1" max="300" />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Weight (kg)</label>
                                            <input type="number" name="weight" value={editForm.weight} onChange={handleProfileInputChange} min="1" max="500" />
                                        </div>
                                        <div className="form-field-group">
                                            <label>BMI (Body Mass Index)</label>
                                            <input type="text" name="bmi" value={editForm.bmi} readOnly style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed' }} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Known Allergies</label>
                                            <input type="text" name="allergies" value={editForm.allergies} onChange={handleProfileInputChange} placeholder="e.g. Penicillin, Peanuts" />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Chronic Diseases</label>
                                            <input type="text" name="chronicDiseases" value={editForm.chronicDiseases} onChange={handleProfileInputChange} placeholder="e.g. Diabetes, Hypertension" />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Medical History</label>
                                            <input type="text" name="medicalHistory" value={editForm.medicalHistory} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Surgical History</label>
                                            <input type="text" name="surgicalHistory" value={editForm.surgicalHistory} onChange={handleProfileInputChange} />
                                        </div>
                                        <div className="form-field-group">
                                            <label>Current Medications</label>
                                            <input type="text" name="currentMedications" value={editForm.currentMedications} onChange={handleProfileInputChange} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            );
        }

        // View mode (Read-only) with improved colorful styling
        return (
            <div className="dashboard-card profile-view-card animate-fade-in">
                <div className="card-body">
                    {/* Header Identity banner */}
                    <div className="profile-gradient-header">
                        <div className="profile-header-avatar-section">
                            {profileData.avatar ? (
                                <img src={profileData.avatar} alt="Avatar" className="profile-large-avatar" />
                            ) : (
                                <div className="profile-large-avatar initials-avatar">{initials}</div>
                            )}
                            <div className="profile-header-text">
                                <h3>{profileData.name}</h3>
                                <div className="profile-header-badges">
                                    <span className="profile-mrn-badge">MRN: {profileData.mrn || profileData.patientId || 'Pending'}</span>
                                    {profileData.uhid && <span className="profile-uhid-badge">UHID: {profileData.uhid}</span>}
                                </div>
                                <p className="profile-header-subtitle">Registered on {profileData.registrationDate ? new Date(profileData.registrationDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</p>
                            </div>
                        </div>
                        <div className="profile-header-actions">
                            <button className="btn-edit-profile" onClick={handleEditClick}>
                                ✏️ Edit Profile
                            </button>
                        </div>
                    </div>

                    {/* Progress Completeness */}
                    <div className="profile-completeness-banner">
                        <div className="completeness-info">
                            <span>Profile Completeness Indicator</span>
                            <span className="completeness-value">{completeness}%</span>
                        </div>
                        <div className="completeness-bar-bg">
                            <div 
                                className="completeness-bar-fill" 
                                style={{ 
                                    width: `${completeness}%`,
                                    backgroundColor: completeness === 100 ? '#10b981' : (completeness > 65 ? '#6366f1' : '#f59e0b')
                                }}
                            ></div>
                        </div>
                    </div>

                    <div className="profile-details-grid">
                        {/* 1. Personal Information */}
                        <div className="profile-detail-card">
                            <div className="detail-card-header">
                                <span className="detail-card-icon">👤</span>
                                <h4>Personal Details</h4>
                            </div>
                            <div className="detail-fields-list">
                                <div className="detail-field-row"><span className="field-label">Name</span><span className="field-value">{profileData.name || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">DOB / Age</span><span className="field-value">{profileData.dob ? new Date(profileData.dob).toLocaleDateString('en-IN') : '—'} {profileData.age ? `(${profileData.age} Years)` : ''}</span></div>
                                <div className="detail-field-row"><span className="field-label">Gender</span><span className="field-value" style={{ textTransform: 'capitalize' }}>{profileData.gender || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Blood Group</span><span className="field-value">{profileData.bloodGroup || '—'}</span></div>
                                <div className="detail-field-row">
                                    <span className="field-label">Aadhaar Number</span>
                                    <span className="field-value">
                                        {profileData.aadhaarNumber 
                                            ? `XXXX-XXXX-${String(profileData.aadhaarNumber).slice(-4)}` 
                                            : (profileData.aadhaar ? `XXXX-XXXX-${String(profileData.aadhaar).slice(-4)}` : '—')}
                                    </span>
                                </div>
                                <div className="detail-field-row"><span className="field-label">PAN Number</span><span className="field-value">{profileData.panNumber || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Marital Status</span><span className="field-value" style={{ textTransform: 'capitalize' }}>{profileData.maritalStatus || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Occupation</span><span className="field-value">{profileData.occupation || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Nationality</span><span className="field-value">{profileData.nationality || '—'}</span></div>
                            </div>
                        </div>

                        {/* 2. Contact Information */}
                        <div className="profile-detail-card">
                            <div className="detail-card-header">
                                <span className="detail-card-icon">📞</span>
                                <h4>Contact Details</h4>
                            </div>
                            <div className="detail-fields-list">
                                <div className="detail-field-row"><span className="field-label">Mobile Number</span><span className="field-value">{profileData.mobile || profileData.phone || patient?.mobile || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Alternate Mobile</span><span className="field-value">{profileData.alternateMobile || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">WhatsApp Number</span><span className="field-value">{profileData.whatsappNumber || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Email Address</span><span className="field-value">{profileData.email || '—'}</span></div>
                            </div>
                        </div>

                        {/* 3. Emergency Contact */}
                        <div className="profile-detail-card">
                            <div className="detail-card-header">
                                <span className="detail-card-icon">🚨</span>
                                <h4>Emergency Contact</h4>
                            </div>
                            <div className="detail-fields-list">
                                <div className="detail-field-row"><span className="field-label">Contact Person</span><span className="field-value">{profileData.emergencyContact?.name || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Relation</span><span className="field-value">{profileData.emergencyContact?.relation || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Mobile Number</span><span className="field-value">{profileData.emergencyContact?.mobile || '—'}</span></div>
                            </div>
                        </div>

                        {/* 4. Address Details */}
                        <div className="profile-detail-card">
                            <div className="detail-card-header">
                                <span className="detail-card-icon">📍</span>
                                <h4>Address Details</h4>
                            </div>
                            <div className="detail-fields-list">
                                <div className="detail-field-row"><span className="field-label">House/Flat No.</span><span className="field-value">{profileData.houseNo || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Building Name</span><span className="field-value">{profileData.buildingName || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Street / Area</span><span className="field-value">{[profileData.street, profileData.area].filter(Boolean).join(', ') || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Landmark</span><span className="field-value">{profileData.landmark || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">City</span><span className="field-value">{profileData.city || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">State</span><span className="field-value">{profileData.state || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Country</span><span className="field-value">{profileData.country || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Pincode</span><span className="field-value">{profileData.zipCode || '—'}</span></div>
                            </div>
                        </div>

                        {/* 5. Medical Info */}
                        <div className="profile-detail-card">
                            <div className="detail-card-header">
                                <span className="detail-card-icon">🩺</span>
                                <h4>Medical Information</h4>
                            </div>
                            <div className="detail-fields-list">
                                <div className="detail-field-row"><span className="field-label">Height</span><span className="field-value">{profileData.fertilityProfile?.height ? `${profileData.fertilityProfile.height} cm` : '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Weight</span><span className="field-value">{profileData.fertilityProfile?.weight ? `${profileData.fertilityProfile.weight} kg` : '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">BMI</span><span className="field-value">{profileData.fertilityProfile?.bmi || '—'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Allergies</span><span className="field-value">{Array.isArray(profileData.fertilityProfile?.allergies) ? profileData.fertilityProfile.allergies.join(', ') : (profileData.fertilityProfile?.allergies || '—')}</span></div>
                                <div className="detail-field-row"><span className="field-label">Chronic Diseases</span><span className="field-value">{Array.isArray(profileData.fertilityProfile?.chronicDiseases) ? profileData.fertilityProfile.chronicDiseases.join(', ') : (profileData.fertilityProfile?.chronicDiseases || '—')}</span></div>
                                <div className="detail-field-row"><span className="field-label">Medical History</span><span className="field-value">{Array.isArray(profileData.fertilityProfile?.medicalHistory) ? profileData.fertilityProfile.medicalHistory.join(', ') : (profileData.fertilityProfile?.medicalHistory || '—')}</span></div>
                                <div className="detail-field-row"><span className="field-label">Surgical History</span><span className="field-value">{Array.isArray(profileData.fertilityProfile?.surgicalHistory) ? profileData.fertilityProfile.surgicalHistory.join(', ') : (profileData.fertilityProfile?.surgicalHistory || '—')}</span></div>
                                <div className="detail-field-row"><span className="field-label">Current Medications</span><span className="field-value">{Array.isArray(profileData.fertilityProfile?.currentMedications) ? profileData.fertilityProfile.currentMedications.join(', ') : (profileData.fertilityProfile?.currentMedications || '—')}</span></div>
                            </div>
                        </div>

                        {/* 6. Hospital Details */}
                        <div className="profile-detail-card">
                            <div className="detail-card-header">
                                <span className="detail-card-icon">🏥</span>
                                <h4>Hospital Information</h4>
                            </div>
                            <div className="detail-fields-list">
                                <div className="detail-field-row"><span className="field-label">Hospital</span><span className="field-value">{profileData.hospitalName || hospitalName}</span></div>
                                <div className="detail-field-row"><span className="field-label">Branch</span><span className="field-value">{profileData.branch || 'Main'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Department</span><span className="field-value">{profileData.department || 'General'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Primary Doctor</span><span className="field-value">{profileData.primaryDoctorName || 'Not Assigned'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Registration Type</span><span className="field-value" style={{ textTransform: 'capitalize' }}>{profileData.registrationType || 'Self'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Patient Status</span><span className="field-value" style={{ textTransform: 'capitalize' }}>{profileData.patientStatus || 'Active'}</span></div>
                                <div className="detail-field-row"><span className="field-label">Patient Type</span><span className="field-value" style={{ textTransform: 'capitalize' }}>{profileData.patientType || 'Primary'}</span></div>
                            </div>
                        </div>

                        {/* IVF Details (Conditional) */}
                        {(profileData.patientType === 'Partner' || profileData.ivfDetails?.coupleId || profileData.partnerName) && (
                            <div className="profile-detail-card">
                                <div className="detail-card-header">
                                    <span className="detail-card-icon">🧬</span>
                                    <h4>IVF / Couple Details</h4>
                                </div>
                                <div className="detail-fields-list">
                                    <div className="detail-field-row"><span className="field-label">Couple ID</span><span className="field-value">{profileData.ivfDetails?.coupleId || '—'}</span></div>
                                    <div className="detail-field-row"><span className="field-label">Partner Name</span><span className="field-value">{profileData.partnerName || '—'}</span></div>
                                    <div className="detail-field-row"><span className="field-label">Partner MRN</span><span className="field-value">{profileData.partnerMrn || '—'}</span></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

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
                                                            
                                                            const fetchDeptUpi = async () => {
                                                                setFetchingUpi(true);
                                                                setDepartmentUpi(null);
                                                                try {
                                                                    const categoryToRole = {
                                                                        'Consultation': 'Reception',
                                                                        'Lab Test': 'Laboratory',
                                                                        'Pharmacy': 'Pharmacy',
                                                                        'Facility Charge': 'Billing',
                                                                        'Admission': 'Billing'
                                                                    };
                                                                    const targetRole = categoryToRole[bill.category] || 'Billing';
                                                                    const res = await patientAuthAPI.getDepartmentUpiByRole(targetRole);
                                                                    if (res.success && res.departmentUpi) {
                                                                        setDepartmentUpi(res.departmentUpi);
                                                                        setPayUpiId(res.departmentUpi.upiId);
                                                                    } else {
                                                                        setPayUpiId('');
                                                                    }
                                                                } catch (err) {
                                                                    console.error("Failed to fetch department UPI", err);
                                                                } finally {
                                                                    setFetchingUpi(false);
                                                                }
                                                            };
                                                            fetchDeptUpi();
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
                                            <td>
                                                {receipt.splitPayments && receipt.splitPayments.length > 1 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        {receipt.splitPayments.map((sp, idx) => (
                                                            <span key={idx} style={{ fontSize: '12px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                                                {sp.method}: ₹{sp.amount}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <strong>{receipt.paymentMode}</strong>
                                                )}
                                            </td>
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
                            <button className="btn-primary" onClick={() => {
                                setRebookingAppt(selectedAppt);
                                setRebookForm({ visitDate: '', visitTime: '' });
                                setSelectedAppt(null);
                            }}>
                                Re-Book Appointment
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

            {/* Rebook Appointment Modal */}
            {rebookingAppt && (
                <div className="patient-modal-overlay" onClick={() => !bookingAppt && setRebookingAppt(null)}>
                    <div className="patient-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <div className="patient-modal-header">
                            <h3>Re-Book Appointment</h3>
                            <button className="patient-modal-close" onClick={() => !bookingAppt && setRebookingAppt(null)}>&times;</button>
                        </div>
                        <div className="patient-modal-body" style={{ padding: '20px' }}>
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Department (Read Only)</label>
                                <input type="text" value={rebookingAppt.department || 'Consultation'} disabled className="patient-input" style={{ width: '100%', backgroundColor: '#f1f5f9', cursor: 'not-allowed' }} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Doctor (Read Only)</label>
                                <input type="text" value={`Dr. ${rebookingAppt.doctorName}`} disabled className="patient-input" style={{ width: '100%', backgroundColor: '#f1f5f9', cursor: 'not-allowed' }} />
                            </div>
                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Select Date</label>
                                <input 
                                    type="date" 
                                    className="patient-input" 
                                    style={{ width: '100%' }}
                                    min={new Date().toISOString().split('T')[0]} 
                                    value={rebookForm.visitDate} 
                                    onChange={(e) => setRebookForm({ ...rebookForm, visitDate: e.target.value, visitTime: '' })}
                                />
                            </div>
                            {rebookForm.visitDate && (
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Available Slots</label>
                                    <SlotPicker 
                                        doctorId={rebookingAppt.doctorId} 
                                        date={rebookForm.visitDate} 
                                        selectedTime={rebookForm.visitTime} 
                                        onSelectTime={(t) => setRebookForm({ ...rebookForm, visitTime: t })}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="patient-modal-footer">
                            <button className="btn-primary" onClick={handleRebookSubmit} disabled={bookingAppt || !rebookForm.visitDate || !rebookForm.visitTime}>
                                {bookingAppt ? 'Booking...' : 'Confirm Appointment'}
                            </button>
                            <button className="btn-danger-outline" onClick={() => !bookingAppt && setRebookingAppt(null)} disabled={bookingAppt}>
                                Cancel
                            </button>
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
                                <strong>Payment Breakdown</strong>
                                {selectedReceipt.splitPayments && selectedReceipt.splitPayments.length > 1 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                        {selectedReceipt.splitPayments.map((sp, idx) => (
                                            <span key={idx} style={{ display: 'inline-block', fontSize: '13px', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                                                {sp.method}: ₹{sp.amount}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span>{selectedReceipt.paymentMode}</span>
                                )}
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
                                                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                                            <div style={{ flex: '1 1 300px' }}>
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
                                                            </div>

                                                            {/* QR Code Section */}
                                                            <div style={{ flex: '0 0 200px' }}>
                                                                {fetchingUpi ? (
                                                                    <div style={{ textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                                                        Loading QR...
                                                                    </div>
                                                                ) : departmentUpi ? (
                                                                    <div style={{
                                                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                                        padding: '16px', background: '#f0fdfa', borderRadius: '12px',
                                                                        border: '1px dashed #0d9488', textAlign: 'center'
                                                                    }}>
                                                                        <div style={{ fontSize: '13px', color: '#0f766e', fontWeight: 'bold', marginBottom: '12px' }}>
                                                                            Scan to Pay (₹{payingBill.amount})
                                                                        </div>
                                                                        <img
                                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent('upi://pay?pa=' + departmentUpi.upiId.trim() + '&pn=Medical365&am=' + payingBill.amount + '&cu=INR')}`}
                                                                            alt="UPI QR Code"
                                                                            style={{ borderRadius: '8px', width: '140px', height: '140px' }}
                                                                        />
                                                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', wordBreak: 'break-all' }}>
                                                                            {departmentUpi.upiId}
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: '#0f766e', marginTop: '4px', fontWeight: 600 }}>
                                                                            {departmentUpi.label}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{
                                                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                                                        padding: '16px', background: '#fef3c7', borderRadius: '12px',
                                                                        border: '1px dashed #f59e0b', textAlign: 'center', height: '100%', justifyContent: 'center'
                                                                    }}>
                                                                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
                                                                        <div style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                                                                            No UPI account is configured for the billing department. You can still pay manually via any UPI app if you have the details.
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
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
