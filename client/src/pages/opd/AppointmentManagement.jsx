import React, { useState, useEffect, useCallback, useRef } from 'react';
import { freeOpdAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { downloadPrescriptionPdf } from '../../utils/prescriptionPdf';
import {
    FiCalendar,
    FiPlus,
    FiSearch,
    FiClock,
    FiEdit2,
    FiXCircle,
    FiCheckCircle,
    FiX,
    FiUserPlus,
    FiFileText,
    FiDownload,
    FiTrash2,
    FiUser,
    FiMail,
    FiPhone,
    FiMapPin,
    FiActivity,
    FiAlertTriangle,
    FiHeart,
} from 'react-icons/fi';
import './AppointmentManagement.css';
import './PatientMonitoring.css';

const getInitialSlotTime = () => {
    const now = new Date();
    let hours = now.getHours();
    let minutes = Math.ceil(now.getMinutes() / 15) * 15;
    if (minutes >= 60) {
        hours += 1;
        minutes = 0;
    }
    if (hours >= 24) hours = 23;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const AppointmentManagement = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { user } = useAuth();
    const { hospitalName } = useBranding();

    // Patient Profile Modal State (Integrated from Patient Monitoring)
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [patientDetails, setPatientDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [profileTab, setProfileTab] = useState('overview'); // 'overview' | 'prescriptions' | 'prescribe'
    const [rxForm, setRxForm] = useState({
        diagnosis: '',
        vitals: { bp: '', pulse: '', temp: '', weight: '', spo2: '' },
        medicines: [
            { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }
        ],
        doctorNotes: '',
        followUpDate: ''
    });
    const [savingRx, setSavingRx] = useState(false);
    const [rxNotice, setRxNotice] = useState('');

    // Patient Quick Search to Open Profile
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchingPatients, setSearchingPatients] = useState(false);
    const [showSearchDropdown, setShowSearchDropdown] = useState(false);
    const searchTimeoutRef = useRef(null);

    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        if (!val.trim()) {
            setSearchResults([]);
            setShowSearchDropdown(false);
            return;
        }
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = setTimeout(async () => {
            setSearchingPatients(true);
            try {
                const res = await freeOpdAPI.searchPatients({ query: val.trim(), limit: 8 });
                if (res.success) {
                    setSearchResults(res.patients || []);
                    setShowSearchDropdown(true);
                }
            } catch (_) {}
            finally {
                setSearchingPatients(false);
            }
        }, 300);
    };

    const openPatientProfile = async (patientId) => {
        if (!patientId) return;
        setSelectedPatientId(patientId);
        setLoadingDetails(true);
        setProfileTab('overview');
        setRxNotice('');
        setShowSearchDropdown(false);
        try {
            const res = await freeOpdAPI.getPatientOverview(patientId);
            if (res.success) {
                setPatientDetails(res);
                if (res.vitals) {
                    setRxForm(prev => ({ ...prev, vitals: { ...prev.vitals, ...res.vitals } }));
                }
            }
        } catch (err) {
            console.error('Error fetching patient profile:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    const closeProfileModal = () => {
        setSelectedPatientId(null);
        setPatientDetails(null);
        setRxNotice('');
    };

    const handleAddRxMedicine = () => {
        setRxForm(prev => ({
            ...prev,
            medicines: [
                ...prev.medicines,
                { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }
            ]
        }));
    };

    const handleRemoveRxMedicine = (index) => {
        setRxForm(prev => ({
            ...prev,
            medicines: prev.medicines.filter((_, i) => i !== index)
        }));
    };

    const handleRxMedChange = (index, field, value) => {
        setRxForm(prev => {
            const updated = [...prev.medicines];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, medicines: updated };
        });
    };

    const handleSavePrescription = async (triggerDownload = false) => {
        setRxNotice('');
        if (!rxForm.diagnosis.trim()) {
            setRxNotice('⚠ Diagnosis is required before saving prescription');
            return;
        }

        const validMeds = rxForm.medicines.filter(m => m.medicineName && m.medicineName.trim().length > 0);
        if (validMeds.length === 0) {
            setRxNotice('⚠ Please prescribe at least one medicine');
            return;
        }

        setSavingRx(true);
        try {
            const payload = {
                patientId: patientDetails.patient._id,
                diagnosis: rxForm.diagnosis.trim(),
                vitals: rxForm.vitals,
                medicines: validMeds,
                doctorNotes: rxForm.doctorNotes.trim(),
                followUpDate: rxForm.followUpDate || undefined
            };

            const res = await freeOpdAPI.savePrescription(payload);
            if (res.success) {
                setRxNotice('✓ Prescription recorded successfully');

                if (triggerDownload) {
                    downloadPrescriptionPdf({
                        clinic: {
                            name: hospitalName || user?.hospitalName || 'Doctor OPD Clinic',
                            address: user?.address || '',
                            city: user?.city || '',
                            phone: user?.phone || ''
                        },
                        doctor: {
                            name: user?.name || 'Doctor',
                            specialty: user?.specialty || user?.services?.[0] || 'OPD Practitioner',
                            qualification: user?.education || user?.qualification || 'MBBS',
                            phone: user?.phone || ''
                        },
                        patient: patientDetails.patient,
                        prescription: {
                            medicines: validMeds,
                            diagnosis: rxForm.diagnosis,
                            doctorNotes: rxForm.doctorNotes,
                            vitals: rxForm.vitals,
                            followUpDate: rxForm.followUpDate
                        },
                        diagnosis: rxForm.diagnosis,
                        notes: rxForm.doctorNotes,
                        followUpDate: rxForm.followUpDate,
                        date: new Date()
                    });
                }

                openPatientProfile(patientDetails.patient._id);
            }
        } catch (err) {
            setRxNotice('Failed to save prescription: ' + (err.response?.data?.message || err.message));
        } finally {
            setSavingRx(false);
        }
    };

    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(todayStr);
    const [statusFilter, setStatusFilter] = useState('all');
    const [todayCount, setTodayCount] = useState(0);

    // Book Modal State (Single Unified Direct Patient Registration & Profile Matching)
    const [showBookModal, setShowBookModal] = useState(false);
    const [bookForm, setBookForm] = useState({
        patientName: '',
        patientPhone: '',
        patientEmail: '',
        gender: 'Male',
        age: '',
        appointmentDate: todayStr,
        appointmentTime: '10:00',
        amount: 300,
        paymentMethod: 'Cash',
        notes: '',
        visitType: 'New Consultation'
    });
    const [detectedPatient, setDetectedPatient] = useState(null);
    const [submittingBook, setSubmittingBook] = useState(false);
    const [bookError, setBookError] = useState('');
    const patientDetectTimeoutRef = useRef(null);

    const handlePatientLookup = (field, val) => {
        const updated = { ...bookForm, [field]: val };
        setBookForm(updated);

        if (patientDetectTimeoutRef.current) clearTimeout(patientDetectTimeoutRef.current);
        patientDetectTimeoutRef.current = setTimeout(async () => {
            const cleanP = (updated.patientPhone || '').replace(/\D/g, '').slice(-10);
            const cleanE = (updated.patientEmail || '').trim().toLowerCase();
            if (cleanP.length === 10 || (cleanE && cleanE.includes('@') && cleanE.includes('.'))) {
                try {
                    const query = cleanE || cleanP;
                    const res = await freeOpdAPI.searchPatients({ query, limit: 1 });
                    if (res.success && res.patients?.length > 0) {
                        const matched = res.patients.find(p => 
                            (cleanE && p.email?.toLowerCase() === cleanE) ||
                            (cleanP.length === 10 && p.phone === cleanP)
                        ) || res.patients[0];
                        if (matched) {
                            setDetectedPatient(matched);
                            setBookForm(prev => ({
                                ...prev,
                                patientName: prev.patientName || matched.name,
                                gender: matched.gender || prev.gender,
                                age: prev.age || (matched.age ? String(matched.age) : '')
                            }));
                            return;
                        }
                    }
                } catch (_) {}
            }
            setDetectedPatient(null);
        }, 300);
    };

    // Reschedule Modal State
    const [rescheduleModal, setRescheduleModal] = useState({ open: false, apptId: null, date: todayStr, time: '10:00' });
    const [rescheduling, setRescheduling] = useState(false);

    // Cancel Modal State
    const [cancelModal, setCancelModal] = useState({ open: false, apptId: null, reason: '' });
    const [cancelling, setCancelling] = useState(false);

    // Fetch Appointments
    const loadAppointments = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (selectedDate) params.date = selectedDate;
            if (statusFilter !== 'all') params.status = statusFilter;

            const res = await freeOpdAPI.listAppointments(params);
            if (res.success) {
                setAppointments(res.appointments || []);
            }
        } catch (err) {
            console.error('Error listing appointments:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, statusFilter]);

    // Load Today's Quota
    const loadQuota = useCallback(async () => {
        try {
            const res = await freeOpdAPI.getTodayTray();
            if (res.success) {
                setTodayCount(res.summary?.total || res.todayAppointments?.length || 0);
            }
        } catch (_) {}
    }, []);

    useEffect(() => {
        loadAppointments();
        loadQuota();
    }, [loadAppointments, loadQuota]);

    const handleOpenBookModal = () => {
        setBookError('');
        setDetectedPatient(null);
        setShowBookModal(true);
    };

    // Handle Book Submit (Catches existing patient by Email/Phone or registers new)
    const handleBookSubmit = async (e) => {
        e.preventDefault();
        setBookError('');
        setSubmittingBook(true);

        try {
            if (!bookForm.patientName.trim()) {
                setBookError('Patient full name is required');
                setSubmittingBook(false);
                return;
            }
            const cleanPhone = bookForm.patientPhone.replace(/\D/g, '').slice(-10);
            if (cleanPhone.length !== 10) {
                setBookError('Valid 10-digit mobile number is required');
                setSubmittingBook(false);
                return;
            }

            const cleanEmail = bookForm.patientEmail && bookForm.patientEmail.trim()
                ? bookForm.patientEmail.trim().toLowerCase()
                : undefined;

            if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
                setBookError('Please enter a valid email address');
                setSubmittingBook(false);
                return;
            }

            let ageNum = undefined;
            if (bookForm.age !== '' && bookForm.age !== null && bookForm.age !== undefined) {
                ageNum = Number(bookForm.age);
                if (isNaN(ageNum) || ageNum < 1 || ageNum > 125) {
                    setBookError('Please enter a valid age between 1 and 125');
                    setSubmittingBook(false);
                    return;
                }
            }

            // Register or automatically catch existing patient by Email or Phone
            const regRes = await freeOpdAPI.registerPatient({
                name: bookForm.patientName.trim(),
                phone: cleanPhone,
                email: cleanEmail,
                gender: bookForm.gender,
                age: ageNum
            });

            if (!regRes.success) {
                setBookError(regRes.message || 'Could not process patient registration');
                setSubmittingBook(false);
                return;
            }

            const patientIdToUse = regRes.patient._id;

            const payload = {
                patientId: patientIdToUse,
                appointmentDate: bookForm.appointmentDate,
                appointmentTime: bookForm.appointmentTime,
                amount: Number(bookForm.amount) || 0,
                paymentMethod: bookForm.paymentMethod,
                notes: bookForm.notes.trim(),
                visitType: bookForm.visitType
            };

            const res = await freeOpdAPI.createAppointment(payload);
            if (res.success) {
                setShowBookModal(false);
                setDetectedPatient(null);
                setBookForm({
                    patientName: '',
                    patientPhone: '',
                    patientEmail: '',
                    gender: 'Male',
                    age: '',
                    appointmentDate: todayStr,
                    appointmentTime: '10:00',
                    amount: 300,
                    paymentMethod: 'Cash',
                    notes: '',
                    visitType: 'New Consultation'
                });
                loadAppointments();
                loadQuota();
            } else {
                setBookError(res.message || 'Failed to book appointment');
            }
        } catch (err) {
            setBookError(err.response?.data?.message || err.message || 'Error booking appointment');
        } finally {
            setSubmittingBook(false);
        }
    };

    // Handle Reschedule
    const handleRescheduleSubmit = async (e) => {
        e.preventDefault();
        setRescheduling(true);
        try {
            const res = await freeOpdAPI.rescheduleAppointment(rescheduleModal.apptId, {
                date: rescheduleModal.date,
                time: rescheduleModal.time
            });
            if (res.success) {
                setRescheduleModal({ open: false, apptId: null, date: todayStr, time: '10:00' });
                loadAppointments();
                loadQuota();
            } else {
                alert(res.message || 'Reschedule failed');
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Error rescheduling');
        } finally {
            setRescheduling(false);
        }
    };

    // Handle Cancel
    const handleCancelSubmit = async (e) => {
        e.preventDefault();
        setCancelling(true);
        try {
            const res = await freeOpdAPI.cancelAppointment(cancelModal.apptId, cancelModal.reason || 'Cancelled by doctor');
            if (res.success) {
                setCancelModal({ open: false, apptId: null, reason: '' });
                loadAppointments();
                loadQuota();
            }
        } catch (err) {
            alert(err.response?.data?.message || err.message || 'Error cancelling appointment');
        } finally {
            setCancelling(false);
        }
    };

    const quotaPct = Math.min(100, Math.round((todayCount / 20) * 100));
    const quotaClass = todayCount >= 20 ? 'limit-reached' : todayCount >= 16 ? 'near-limit' : '';

    return (
        <div className="am-container">
            {/* Daily Quota Progress Banner */}
            <div className="am-quota-banner">
                <div className="am-quota-info">
                    <h4>Daily Appointment Quota (20 Max/Day)</h4>
                    <p>Doctor OPD plan allows up to 20 appointments per day.</p>
                </div>

                <div className="am-quota-bar-wrap">
                    <div className="am-progress-bg">
                        <div
                            className={`am-progress-fill ${quotaClass}`}
                            style={{ width: `${quotaPct}%` }}
                        />
                    </div>
                    <div className="am-quota-stats">
                        <span>Used: {todayCount} / 20</span>
                        <span>{20 - todayCount} Remaining Today</span>
                    </div>
                </div>

                <button
                    type="button"
                    className="pm-action-btn-primary"
                    onClick={handleOpenBookModal}
                >
                    <FiPlus />
                    <span>Book Appointment</span>
                </button>
            </div>

            {/* Filter Toolbar */}
            <div className="am-controls">
                {/* Quick Search & Open Patient Profile */}
                <div className="am-filter-group" style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
                    <div className="pm-search-box" style={{ width: '100%', maxWidth: '380px' }}>
                        <FiSearch style={{ color: '#94a3b8' }} />
                        <input
                            type="text"
                            className="pm-search-input"
                            placeholder="Search patient by Name, Phone, UID to open profile..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                onClick={() => { setSearchQuery(''); setSearchResults([]); setShowSearchDropdown(false); }}
                            >
                                <FiX />
                            </button>
                        )}
                    </div>

                    {showSearchDropdown && searchResults.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            zIndex: 40,
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '10px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.12)',
                            width: '380px',
                            maxHeight: '260px',
                            overflowY: 'auto',
                            marginTop: '4px'
                        }}>
                            {searchResults.map((p) => (
                                <div
                                    key={p._id}
                                    style={{
                                        padding: '10px 14px',
                                        borderBottom: '1px solid #f1f5f9',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    onClick={() => openPatientProfile(p._id)}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{p.name}</div>
                                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                                            {p.patientUid || p.patientId || 'UID'} • {p.phone || 'No phone'}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '11.5px', color: '#0d9488', fontWeight: 700 }}>
                                        Open Profile →
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="am-filter-group">
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Filter Date:</label>
                    <input
                        type="date"
                        className="pm-input"
                        style={{ width: 'auto' }}
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                    />
                    <button
                        type="button"
                        className="pm-btn-secondary"
                        onClick={() => setSelectedDate(todayStr)}
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        className="pm-btn-secondary"
                        onClick={() => setSelectedDate('')}
                    >
                        All Dates
                    </button>
                </div>

                <div className="am-filter-group">
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Status:</label>
                    <select
                        className="pm-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="pending">Pending</option>
                        <option value="in-consultation">In Consultation</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
            </div>

            {/* Appointments Master Table */}
            <div className="am-table-card">
                <div className="am-table-wrap">
                    <table className="am-table">
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Patient Name</th>
                                <th>Patient UID / Mobile</th>
                                <th>Visit Type</th>
                                <th>Fee (₹)</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        Loading appointments...
                                    </td>
                                </tr>
                            ) : appointments.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        No appointments found for the selected criteria.
                                    </td>
                                </tr>
                            ) : (
                                appointments.map((appt) => {
                                    const pName = appt.userId?.name || appt.clinicPatientId?.name || 'Walk-in';
                                    const pPhone = appt.userId?.phone || appt.clinicPatientId?.phone || '—';
                                    const pUid = appt.userId?.patientId || appt.userId?.mrn || appt.clinicPatientId?.patientUid || appt.patientId || 'N/A';
                                    const apptDateStr = new Date(appt.appointmentDate).toLocaleDateString('en-IN', {
                                        day: '2-digit', month: 'short', year: 'numeric'
                                    });

                                    return (
                                        <tr key={appt._id}>
                                            <td>
                                                <strong>{apptDateStr}</strong>
                                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{appt.appointmentTime || '10:00 AM'}</div>
                                            </td>
                                            <td>
                                                <strong
                                                    style={{ color: '#0f172a', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#cbd5e1' }}
                                                    title="Click to open patient profile"
                                                    onClick={() => {
                                                        const pId = appt.clinicPatientId?._id || appt.userId?._id || appt.patientId || appt.clinicPatientId || appt.userId;
                                                        openPatientProfile(pId);
                                                    }}
                                                >
                                                    {pName}
                                                </strong>
                                            </td>
                                            <td>
                                                <span
                                                    className="pm-patient-id-badge"
                                                    style={{ cursor: 'pointer' }}
                                                    title="Click to open patient profile"
                                                    onClick={() => {
                                                        const pId = appt.clinicPatientId?._id || appt.userId?._id || appt.patientId || appt.clinicPatientId || appt.userId;
                                                        openPatientProfile(pId);
                                                    }}
                                                >
                                                    {pUid}
                                                </span>
                                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{pPhone}</div>
                                            </td>
                                            <td>{appt.visitType || 'OPD Consult'}</td>
                                            <td>₹{appt.amount || 0}</td>
                                            <td>
                                                <span className={`am-status-badge am-status-${appt.status}`}>
                                                    {appt.status?.toUpperCase() || 'CONFIRMED'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <button
                                                    type="button"
                                                    className="am-action-btn"
                                                    style={{ color: '#0d9488', borderColor: '#99f6e4', fontWeight: 700 }}
                                                    title="Open Patient Profile, Medical History & Prescriptions"
                                                    onClick={() => {
                                                        const pId = appt.clinicPatientId?._id || appt.userId?._id || appt.patientId || appt.clinicPatientId || appt.userId;
                                                        openPatientProfile(pId);
                                                    }}
                                                >
                                                    <FiFileText style={{ marginRight: '4px' }} /> Profile
                                                </button>
                                                {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="am-action-btn"
                                                            onClick={() => setRescheduleModal({
                                                                open: true,
                                                                apptId: appt._id,
                                                                date: appt.appointmentDate ? appt.appointmentDate.split('T')[0] : todayStr,
                                                                time: appt.appointmentTime || '10:00'
                                                            })}
                                                        >
                                                            <FiEdit2 style={{ marginRight: '4px' }} /> Reschedule
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="am-action-btn"
                                                            style={{ color: '#ef4444' }}
                                                            onClick={() => setCancelModal({ open: true, apptId: appt._id, reason: '' })}
                                                        >
                                                            <FiXCircle style={{ marginRight: '4px' }} /> Cancel
                                                        </button>
                                                    </>
                                                )}
                                                {appt.status === 'completed' && (
                                                    <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>✓ Completed</span>
                                                )}
                                                {appt.status === 'cancelled' && (
                                                    <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600 }}>Cancelled</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
               BOOK OPD APPOINTMENT MODAL (Direct Patient Registration & Profile Matching)
               ───────────────────────────────────────────────────────────── */}
            {showBookModal && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" style={{ maxWidth: '640px' }} role="dialog" aria-modal="true" data-scrollable="true">
                        <div className="pm-modal-header">
                            <div>
                                <h3 className="pm-modal-title" style={{ margin: 0 }}>Book OPD Appointment</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Register patient and schedule appointment in one seamless step
                                </p>
                            </div>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setShowBookModal(false)}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleBookSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <div className="pm-modal-body" data-lenis-prevent data-scrollable="true" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                                {bookError && (
                                    <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid #fecaca' }}>
                                        <span style={{ fontSize: '18px' }}>⚠️</span>
                                        <span style={{ fontWeight: 600 }}>{bookError}</span>
                                    </div>
                                )}

                                {/* Returning Patient Auto-Catch Notice */}
                                {detectedPatient && (
                                    <div style={{
                                        background: '#ecfdf5',
                                        border: '1px solid #a7f3d0',
                                        color: '#065f46',
                                        padding: '12px 16px',
                                        borderRadius: '10px',
                                        marginBottom: '20px',
                                        fontSize: '13px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px'
                                    }}>
                                        <FiCheckCircle style={{ color: '#059669', fontSize: '18px', flexShrink: 0 }} />
                                        <div>
                                            <strong>Returning Patient Detected:</strong> {detectedPatient.name} ({detectedPatient.patientUid || detectedPatient.patientId || 'UID'})
                                            <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                                                Appointment will be attached to this patient's existing records automatically.
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 2-Column Responsive Form Layout */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                                    {/* Left Column: Patient Demographics */}
                                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0d9488', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>👤</span>
                                            <span>1. Patient Details</span>
                                        </div>

                                        <div className="pm-form-grid">
                                            <div className="pm-form-group full-width">
                                                <label className="pm-label">Patient Full Name *</label>
                                                <input
                                                    type="text"
                                                    className="pm-input"
                                                    placeholder="e.g. Meena Devi"
                                                    value={bookForm.patientName}
                                                    onChange={(e) => setBookForm({ ...bookForm, patientName: e.target.value })}
                                                    required
                                                />
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">Mobile Number (10 digits) *</label>
                                                <input
                                                    type="tel"
                                                    className="pm-input"
                                                    placeholder="9876543210"
                                                    maxLength="10"
                                                    value={bookForm.patientPhone}
                                                    onChange={(e) => handlePatientLookup('patientPhone', e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">
                                                    Email Address <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>(Auto-links profile)</span>
                                                </label>
                                                <input
                                                    type="email"
                                                    className="pm-input"
                                                    placeholder="patient@example.com"
                                                    value={bookForm.patientEmail}
                                                    onChange={(e) => handlePatientLookup('patientEmail', e.target.value)}
                                                />
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">Gender</label>
                                                <select
                                                    className="pm-select"
                                                    value={bookForm.gender}
                                                    onChange={(e) => setBookForm({ ...bookForm, gender: e.target.value })}
                                                >
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                    <option value="Other">Other</option>
                                                </select>
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">Age (Years)</label>
                                                <input
                                                    type="number"
                                                    className="pm-input"
                                                    placeholder="e.g. 30"
                                                    min="1"
                                                    max="125"
                                                    value={bookForm.age}
                                                    onChange={(e) => setBookForm({ ...bookForm, age: e.target.value })}
                                                />
                                            </div>

                                            <div className="pm-form-group full-width">
                                                <label className="pm-label">Visit Type</label>
                                                <select
                                                    className="pm-select"
                                                    value={bookForm.visitType}
                                                    onChange={(e) => setBookForm({ ...bookForm, visitType: e.target.value })}
                                                >
                                                    <option value="New Consultation">New Consultation</option>
                                                    <option value="Follow-up">Follow-up / Revisit</option>
                                                    <option value="Emergency">Emergency</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Appointment Schedule & Payment */}
                                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0d9488', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>📅</span>
                                            <span>2. Appointment & Consultation Details</span>
                                        </div>

                                        <div className="pm-form-grid">
                                            <div className="pm-form-group">
                                                <label className="pm-label">Appointment Date * <span style={{ fontSize: '11px', color: '#0d9488' }}>(Today or Future)</span></label>
                                                <input
                                                    type="date"
                                                    className="pm-input"
                                                    min={todayStr}
                                                    value={bookForm.appointmentDate}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val < todayStr) {
                                                            setBookError('Appointment date cannot be in the past');
                                                            setBookForm({ ...bookForm, appointmentDate: todayStr, appointmentTime: getInitialSlotTime() });
                                                        } else {
                                                            setBookError('');
                                                            setBookForm({ ...bookForm, appointmentDate: val });
                                                        }
                                                    }}
                                                    required
                                                />
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">Appointment Time *</label>
                                                <input
                                                    type="time"
                                                    className="pm-input"
                                                    value={bookForm.appointmentTime}
                                                    onChange={(e) => {
                                                        const tVal = e.target.value;
                                                        setBookForm({ ...bookForm, appointmentTime: tVal });
                                                        if (bookForm.appointmentDate === todayStr && tVal) {
                                                            const [h, m] = tVal.split(':').map(Number);
                                                            const now = new Date();
                                                            if (h < now.getHours() || (h === now.getHours() && m < now.getMinutes())) {
                                                                const curTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                                                                setBookError(`Appointment time cannot be in the past. Current time is ${curTimeStr}`);
                                                            } else {
                                                                setBookError('');
                                                            }
                                                        }
                                                    }}
                                                    required
                                                />
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">Consultation Fee (₹)</label>
                                                <input
                                                    type="number"
                                                    className="pm-input"
                                                    placeholder="300"
                                                    min="0"
                                                    value={bookForm.amount}
                                                    onChange={(e) => setBookForm({ ...bookForm, amount: e.target.value })}
                                                />
                                            </div>

                                            <div className="pm-form-group">
                                                <label className="pm-label">Payment Mode</label>
                                                <select
                                                    className="pm-select"
                                                    value={bookForm.paymentMethod}
                                                    onChange={(e) => setBookForm({ ...bookForm, paymentMethod: e.target.value })}
                                                >
                                                    <option value="Cash">Cash (Directly Paid)</option>
                                                    <option value="UPI">UPI / QR (Directly Paid)</option>
                                                    <option value="Card">Debit / Credit Card</option>
                                                    <option value="Pending">Pay Later (Pending)</option>
                                                </select>
                                            </div>

                                            {/* Optional Next Follow-up Revisit Date */}
                                            <div className="pm-form-group full-width">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                    <label className="pm-label" style={{ margin: 0 }}>
                                                        Scheduled Follow-up Revisit (Optional)
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '4px' }}>
                                                        <button
                                                            type="button"
                                                            style={{ fontSize: '11px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                                            onClick={() => {
                                                                const d = new Date();
                                                                d.setDate(d.getDate() + 3);
                                                                setBookForm(prev => ({ ...prev, followUpDate: d.toISOString().split('T')[0] }));
                                                            }}
                                                        >
                                                            +3 Days
                                                        </button>
                                                        <button
                                                            type="button"
                                                            style={{ fontSize: '11px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                                            onClick={() => {
                                                                const d = new Date();
                                                                d.setDate(d.getDate() + 7);
                                                                setBookForm(prev => ({ ...prev, followUpDate: d.toISOString().split('T')[0] }));
                                                            }}
                                                        >
                                                            +1 Wk
                                                        </button>
                                                        <button
                                                            type="button"
                                                            style={{ fontSize: '11px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                                            onClick={() => {
                                                                const d = new Date();
                                                                d.setDate(d.getDate() + 14);
                                                                setBookForm(prev => ({ ...prev, followUpDate: d.toISOString().split('T')[0] }));
                                                            }}
                                                        >
                                                            +2 Wks
                                                        </button>
                                                    </div>
                                                </div>
                                                <input
                                                    type="date"
                                                    className="pm-input"
                                                    min={todayStr}
                                                    value={bookForm.followUpDate}
                                                    onChange={(e) => setBookForm({ ...bookForm, followUpDate: e.target.value })}
                                                />
                                            </div>

                                            <div className="pm-form-group full-width">
                                                <label className="pm-label">Clinical Notes / Chief Complaint</label>
                                                <input
                                                    type="text"
                                                    className="pm-input"
                                                    placeholder="e.g. Mild fever, persistent cough for 2 days"
                                                    value={bookForm.notes}
                                                    onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setShowBookModal(false)}
                                    disabled={submittingBook}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pm-btn-primary"
                                    disabled={submittingBook}
                                    style={{ minWidth: '180px' }}
                                >
                                    {submittingBook ? 'Confirming...' : 'Confirm & Book Appointment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
               RESCHEDULE MODAL
               ───────────────────────────────────────────────────────────── */}
            {rescheduleModal.open && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" style={{ maxWidth: '440px' }}>
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Reschedule Appointment</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setRescheduleModal({ open: false, apptId: null, date: todayStr, time: '10:00' })}
                            >
                                <FiX />
                            </button>
                        </div>
                        <form onSubmit={handleRescheduleSubmit}>
                            <div className="pm-modal-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div>
                                        <label className="pm-label">New Appointment Date *</label>
                                        <input
                                            type="date"
                                            className="pm-input"
                                            value={rescheduleModal.date}
                                            onChange={(e) => setRescheduleModal({ ...rescheduleModal, date: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="pm-label">New Appointment Time</label>
                                        <input
                                            type="time"
                                            className="pm-input"
                                            value={rescheduleModal.time}
                                            onChange={(e) => setRescheduleModal({ ...rescheduleModal, time: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setRescheduleModal({ open: false, apptId: null, date: todayStr, time: '10:00' })}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pm-btn-primary"
                                    disabled={rescheduling}
                                >
                                    {rescheduling ? 'Rescheduling...' : 'Save New Date'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
               CANCEL MODAL
               ───────────────────────────────────────────────────────────── */}
            {cancelModal.open && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" style={{ maxWidth: '440px' }}>
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Cancel Appointment</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setCancelModal({ open: false, apptId: null, reason: '' })}
                            >
                                <FiX />
                            </button>
                        </div>
                        <form onSubmit={handleCancelSubmit}>
                            <div className="pm-modal-body">
                                <p style={{ fontSize: '13px', color: '#64748b', marginTop: 0 }}>
                                    Are you sure you want to cancel this appointment? This action will free up the daily quota slot.
                                </p>
                                <div>
                                    <label className="pm-label">Cancellation Reason</label>
                                    <input
                                        type="text"
                                        className="pm-input"
                                        placeholder="e.g. Patient requested cancellation"
                                        value={cancelModal.reason}
                                        onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setCancelModal({ open: false, apptId: null, reason: '' })}
                                >
                                    Keep Appointment
                                </button>
                                <button
                                    type="submit"
                                    style={{ background: '#ef4444', color: '#ffffff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                                    disabled={cancelling}
                                >
                                    {cancelling ? 'Cancelling...' : 'Cancel Appointment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* ─────────────────────────────────────────────────────────────
               INDIVIDUAL PATIENT PROFILE & DIRECT PRESCRIBE (Integrated from Patient Monitoring)
               ───────────────────────────────────────────────────────────── */}
            {selectedPatientId && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card pm-modal-fullscreen" role="dialog" aria-modal="true" data-scrollable="true">
                        <div className="pm-modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e6fffa', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                    <FiUser />
                                </div>
                                <div>
                                    <h3 className="pm-modal-title" style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                        Patient Profile & Comprehensive Clinical Record
                                    </h3>
                                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                                        Complete demographics, contact info, clinical alerts, and historical visits
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={closeProfileModal}
                                title="Close Profile (Esc)"
                                style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                <FiX style={{ fontSize: '22px' }} />
                            </button>
                        </div>

                        <div className="pm-modal-body" data-lenis-prevent data-scrollable="true" style={{ padding: '24px 28px', background: '#f8fafc', flex: 1, overflowY: 'auto' }}>
                            {loadingDetails || !patientDetails ? (
                                <div className="pm-empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Loading patient profile...</div>
                                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Fetching demographics, contact info, and medical history</div>
                                </div>
                            ) : (
                                <>
                                    {/* Patient Hero Banner */}
                                    <div className="pm-profile-hero">
                                        <div className="pm-profile-avatar-row">
                                            <div className="pm-profile-avatar">
                                                {(patientDetails.patient?.name || 'P').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="pm-profile-name">
                                                    {patientDetails.patient?.name || 'Patient'}
                                                </div>
                                                <div className="pm-profile-chips">
                                                    <span className="pm-chip uid-chip">
                                                        🆔 UID: {patientDetails.patient?.patientId || patientDetails.patient?.patientUid || 'N/A'}
                                                    </span>
                                                    <span className="pm-chip">
                                                        📞 {patientDetails.patient?.phone || 'No phone'}
                                                    </span>
                                                    <span className="pm-chip email-chip" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', fontWeight: 600 }}>
                                                        <FiMail style={{ marginRight: '4px' }} />
                                                        {patientDetails.patient?.email || 'No email provided'}
                                                    </span>
                                                    {patientDetails.patient?.age && (
                                                        <span className="pm-chip">
                                                            🎂 {patientDetails.patient.age} Yrs {patientDetails.patient?.gender ? `(${patientDetails.patient.gender})` : ''}
                                                        </span>
                                                    )}
                                                    {patientDetails.patient?.bloodGroup && (
                                                        <span className="pm-chip" style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>
                                                            🩸 {patientDetails.patient.bloodGroup}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tabs Bar: Overview vs Prescriptions (Removed Prescribe Now) */}
                                    <div className="pm-tabs-bar" style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'overview' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('overview')}
                                            style={{ padding: '10px 18px', fontWeight: 700, fontSize: '13.5px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: profileTab === 'overview' ? '3px solid #0d9488' : '3px solid transparent', color: profileTab === 'overview' ? '#0d9488' : '#64748b' }}
                                        >
                                            Overview & Clinical Information
                                        </button>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'prescriptions' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('prescriptions')}
                                            style={{ padding: '10px 18px', fontWeight: 700, fontSize: '13.5px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: profileTab === 'prescriptions' ? '3px solid #0d9488' : '3px solid transparent', color: profileTab === 'prescriptions' ? '#0d9488' : '#64748b' }}
                                        >
                                            Prescriptions History ({patientDetails.prescriptions?.length || 0})
                                        </button>
                                    </div>

                                    {/* TAB 1: OVERVIEW & CLINICAL DETAILS */}
                                    {profileTab === 'overview' && (
                                        <div>
                                            {/* 3-Card Detailed Information Grid */}
                                            <div className="pm-profile-grid">
                                                {/* Card 1: Personal & Contact Information */}
                                                <div className="pm-info-card">
                                                    <div className="pm-info-card-header">
                                                        <span>👤 Personal & Contact Info</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Full Name</span>
                                                        <span className="pm-info-value">{patientDetails.patient?.name || 'N/A'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Patient UID</span>
                                                        <span className="pm-info-value" style={{ color: '#0d9488' }}>
                                                            {patientDetails.patient?.patientId || patientDetails.patient?.patientUid || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Mobile Phone</span>
                                                        <span className="pm-info-value">{patientDetails.patient?.phone || 'N/A'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Email Address</span>
                                                        <span className="pm-info-value" style={{ color: patientDetails.patient?.email ? '#0284c7' : '#94a3b8', wordBreak: 'break-all', fontWeight: 700 }}>
                                                            {patientDetails.patient?.email || 'Not provided'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Age & Gender</span>
                                                        <span className="pm-info-value">
                                                            {patientDetails.patient?.age ? `${patientDetails.patient.age} Yrs` : 'N/A'} {patientDetails.patient?.gender ? `(${patientDetails.patient.gender})` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Blood Group</span>
                                                        <span className="pm-info-value" style={{ color: '#dc2626' }}>
                                                            {patientDetails.patient?.bloodGroup || 'Not specified'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Address</span>
                                                        <span className="pm-info-value" style={{ fontSize: '12px' }}>
                                                            {[patientDetails.patient?.address, patientDetails.patient?.city, patientDetails.patient?.state, patientDetails.patient?.pincode].filter(Boolean).join(', ') || 'Not provided'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Card 2: Medical & Clinical Alerts */}
                                                <div className="pm-info-card">
                                                    <div className="pm-info-card-header">
                                                        <span>⚠️ Medical Alerts & Conditions</span>
                                                    </div>
                                                    <div style={{ marginBottom: '14px' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Known Allergies</span>
                                                        <div style={{ marginTop: '4px', padding: '8px 12px', background: patientDetails.patient?.allergies ? '#fef2f2' : '#f8fafc', border: `1px solid ${patientDetails.patient?.allergies ? '#fecaca' : '#e2e8f0'}`, borderRadius: '8px', fontWeight: 600, color: patientDetails.patient?.allergies ? '#dc2626' : '#475569', fontSize: '13px' }}>
                                                            {patientDetails.patient?.allergies || 'None reported'}
                                                        </div>
                                                    </div>
                                                    <div style={{ marginBottom: '14px' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Chronic Conditions</span>
                                                        <div style={{ marginTop: '4px', padding: '8px 12px', background: patientDetails.patient?.chronicConditions ? '#fffbeb' : '#f8fafc', border: `1px solid ${patientDetails.patient?.chronicConditions ? '#fde68a' : '#e2e8f0'}`, borderRadius: '8px', fontWeight: 600, color: patientDetails.patient?.chronicConditions ? '#b45309' : '#475569', fontSize: '13px' }}>
                                                            {patientDetails.patient?.chronicConditions || 'None reported'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Medical Notes</span>
                                                        <div style={{ marginTop: '4px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#475569', fontSize: '12.5px', lineHeight: 1.4 }}>
                                                            {patientDetails.patient?.medicalNotes || 'No specific clinical notes on record.'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card 3: Latest Recorded Vitals */}
                                                <div className="pm-info-card">
                                                    <div className="pm-info-card-header">
                                                        <span>💓 Latest Vitals & Stats</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Blood Pressure (BP)</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.bp || 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Pulse Rate</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.pulse ? `${patientDetails.vitals.pulse} bpm` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Body Temperature</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.temp ? `${patientDetails.vitals.temp} °F` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Oxygen SpO2</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.spo2 ? `${patientDetails.vitals.spo2} %` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Weight</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.weight ? `${patientDetails.vitals.weight} kg` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Total Recorded Visits</span>
                                                        <span className="pm-info-value" style={{ color: '#0d9488' }}>
                                                            {patientDetails.appointments?.length || 0} Consultations
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Consultation Visits History */}
                                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>
                                                    Consultation History ({patientDetails.appointments?.length || 0} Visits)
                                                </h4>

                                                {(!patientDetails.appointments || patientDetails.appointments.length === 0) ? (
                                                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                                                        No consultation visits recorded for this patient yet.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {patientDetails.appointments.map((appt) => (
                                                            <div
                                                                key={appt._id}
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    padding: '12px 16px',
                                                                    background: '#f8fafc',
                                                                    border: '1px solid #e2e8f0',
                                                                    borderRadius: '10px',
                                                                    flexWrap: 'wrap',
                                                                    gap: '8px'
                                                                }}
                                                            >
                                                                <div>
                                                                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
                                                                        📅 {new Date(appt.appointmentDate || appt.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </div>
                                                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                                                                        {appt.doctorName || appt.doctorId?.name ? `Doctor: ${appt.doctorName || appt.doctorId?.name}` : 'General Consultation'}
                                                                        {appt.diagnosis && ` • Diagnosis: ${appt.diagnosis}`}
                                                                        {appt.chiefComplaint && ` • Complaint: ${appt.chiefComplaint}`}
                                                                    </div>
                                                                </div>
                                                                <span
                                                                    style={{
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: 700,
                                                                        textTransform: 'uppercase',
                                                                        background: appt.status === 'completed' ? '#dcfce7' : appt.status === 'in-consultation' ? '#dbeafe' : '#f1f5f9',
                                                                        color: appt.status === 'completed' ? '#15803d' : appt.status === 'in-consultation' ? '#1d4ed8' : '#475569'
                                                                    }}
                                                                >
                                                                    {appt.status}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* TAB 2: PRESCRIPTIONS HISTORY */}
                                    {profileTab === 'prescriptions' && (
                                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 22px' }}>
                                            <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>
                                                Issued Prescriptions & Medication Logs
                                            </h4>

                                            {(!patientDetails.prescriptions || patientDetails.prescriptions.length === 0) ? (
                                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13.5px' }}>
                                                    No prescriptions have been issued to this patient yet.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    {patientDetails.prescriptions.map((rx, idx) => (
                                                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '18px 20px', borderRadius: '14px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                                                                <div>
                                                                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                                                                        📄 Prescription Date: {new Date(rx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </strong>
                                                                    {rx.diagnosis && (
                                                                        <span style={{ marginLeft: '12px', color: '#0d9488', fontWeight: 700, fontSize: '13px' }}>
                                                                            • {rx.diagnosis}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    className="pm-view-btn"
                                                                    onClick={() => {
                                                                        downloadPrescriptionPdf({
                                                                            clinic: {
                                                                                name: hospitalName || user?.hospitalName || 'Doctor OPD Clinic',
                                                                                address: user?.address || '',
                                                                                city: user?.city || '',
                                                                                phone: user?.phone || ''
                                                                            },
                                                                            doctor: {
                                                                                name: user?.name || 'Doctor',
                                                                                specialty: user?.specialty || user?.services?.[0] || 'OPD Practitioner',
                                                                                qualification: user?.education || user?.qualification || 'MBBS',
                                                                                phone: user?.phone || ''
                                                                            },
                                                                            patient: patientDetails.patient,
                                                                            prescription: rx,
                                                                            diagnosis: rx.diagnosis,
                                                                            date: rx.date
                                                                        });
                                                                    }}
                                                                >
                                                                    <FiDownload />
                                                                    <span>Download PDF</span>
                                                                </button>
                                                            </div>

                                                            {rx.medicines?.length > 0 && (
                                                                <div style={{ overflowX: 'auto' }}>
                                                                    <table className="pm-meds-table" style={{ width: '100%', marginTop: '6px' }}>
                                                                        <thead>
                                                                            <tr>
                                                                                <th>Medicine Name</th>
                                                                                <th>Dosage</th>
                                                                                <th>Frequency</th>
                                                                                <th>Duration</th>
                                                                                <th>Instructions</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {rx.medicines.map((m, mIdx) => (
                                                                                <tr key={mIdx}>
                                                                                    <td><strong>{m.medicineName || m.name}</strong></td>
                                                                                    <td>{m.dosage}</td>
                                                                                    <td>{m.frequency}</td>
                                                                                    <td>{m.duration}</td>
                                                                                    <td>{m.instructions}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppointmentManagement;

