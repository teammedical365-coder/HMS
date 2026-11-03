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
} from 'react-icons/fi';
import './AppointmentManagement.css';
import './PatientMonitoring.css';

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

    // Book Modal State
    const [showBookModal, setShowBookModal] = useState(false);
    const [bookingType, setBookingType] = useState('existing'); // 'existing' or 'new'
    const [bookForm, setBookForm] = useState({
        patientId: '',
        newPatientName: '',
        newPatientPhone: '',
        newPatientGender: 'Male',
        newPatientAge: '',
        appointmentDate: todayStr,
        appointmentTime: '10:00',
        amount: 300,
        paymentMethod: 'Cash',
        notes: '',
        visitType: 'New Consultation'
    });
    const [patientsList, setPatientsList] = useState([]);
    const [submittingBook, setSubmittingBook] = useState(false);
    const [bookError, setBookError] = useState('');

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

    // Fetch Patients for Dropdown when opening booking modal
    const handleOpenBookModal = async () => {
        setBookError('');
        setShowBookModal(true);
        try {
            const res = await freeOpdAPI.searchPatients({ limit: 100 });
            if (res.success) {
                setPatientsList(res.patients || []);
            }
        } catch (_) {}
    };

    // Handle Book Submit
    const handleBookSubmit = async (e) => {
        e.preventDefault();
        setBookError('');
        setSubmittingBook(true);

        try {
            let patientIdToUse = bookForm.patientId;

            // If new patient, register them first!
            if (bookingType === 'new') {
                if (!bookForm.newPatientName.trim()) {
                    setBookError('Patient name is required');
                    setSubmittingBook(false);
                    return;
                }
                const cleanPhone = bookForm.newPatientPhone.replace(/\D/g, '').slice(-10);
                if (cleanPhone.length !== 10) {
                    setBookError('Valid 10-digit phone number is required');
                    setSubmittingBook(false);
                    return;
                }

                const regRes = await freeOpdAPI.registerPatient({
                    name: bookForm.newPatientName.trim(),
                    phone: cleanPhone,
                    gender: bookForm.newPatientGender,
                    age: bookForm.newPatientAge ? Number(bookForm.newPatientAge) : undefined
                });

                if (!regRes.success) {
                    setBookError(regRes.message || 'Could not register patient');
                    setSubmittingBook(false);
                    return;
                }
                patientIdToUse = regRes.patient._id;
            }

            if (!patientIdToUse) {
                setBookError('Please select or register a patient');
                setSubmittingBook(false);
                return;
            }

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
                setBookForm({
                    patientId: '',
                    newPatientName: '',
                    newPatientPhone: '',
                    newPatientGender: 'Male',
                    newPatientAge: '',
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
                    <h4>Daily Appointment Quota (20 Max / IST Calendar Day)</h4>
                    <p>Free Doctor OPD Plan automatically renews 20 appointment slots at 00:00 IST every night.</p>
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
               BOOK APPOINTMENT MODAL (Existing or New Patient)
               ───────────────────────────────────────────────────────────── */}
            {showBookModal && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card">
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Book OPD Appointment</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setShowBookModal(false)}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleBookSubmit}>
                            <div className="pm-modal-body">
                                {bookError && (
                                    <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                                        ⚠ {bookError}
                                    </div>
                                )}

                                {/* Patient Selection Mode Switcher */}
                                <div style={{ display: 'flex', gap: '16px', background: '#f1f5f9', padding: '8px 14px', borderRadius: '10px', marginBottom: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="bookingType"
                                            value="existing"
                                            checked={bookingType === 'existing'}
                                            onChange={() => setBookingType('existing')}
                                        />
                                        <span>Select Registered Patient</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                                        <input
                                            type="radio"
                                            name="bookingType"
                                            value="new"
                                            checked={bookingType === 'new'}
                                            onChange={() => setBookingType('new')}
                                        />
                                        <span>➕ Register New Patient Inline</span>
                                    </label>
                                </div>

                                <div className="pm-form-grid">
                                    {bookingType === 'existing' ? (
                                        <div className="pm-form-group full-width">
                                            <label className="pm-label">Select Patient *</label>
                                            <select
                                                className="pm-select"
                                                value={bookForm.patientId}
                                                onChange={(e) => setBookForm({ ...bookForm, patientId: e.target.value })}
                                                required
                                            >
                                                <option value="">-- Choose Patient --</option>
                                                {patientsList.map(p => (
                                                    <option key={p._id} value={p._id}>
                                                        {p.name} ({p.patientId || p.patientUid || 'UID'} • {p.phone || 'No phone'})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="pm-form-group full-width">
                                                <label className="pm-label">New Patient Full Name *</label>
                                                <input
                                                    type="text"
                                                    className="pm-input"
                                                    placeholder="e.g. Meena Devi"
                                                    value={bookForm.newPatientName}
                                                    onChange={(e) => setBookForm({ ...bookForm, newPatientName: e.target.value })}
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
                                                    value={bookForm.newPatientPhone}
                                                    onChange={(e) => setBookForm({ ...bookForm, newPatientPhone: e.target.value })}
                                                    required
                                                />
                                            </div>
                                            <div className="pm-form-group">
                                                <label className="pm-label">Age (Years)</label>
                                                <input
                                                    type="number"
                                                    className="pm-input"
                                                    placeholder="30"
                                                    value={bookForm.newPatientAge}
                                                    onChange={(e) => setBookForm({ ...bookForm, newPatientAge: e.target.value })}
                                                />
                                            </div>
                                        </>
                                    )}

                                    <div className="pm-form-group">
                                        <label className="pm-label">Appointment Date *</label>
                                        <input
                                            type="date"
                                            className="pm-input"
                                            value={bookForm.appointmentDate}
                                            onChange={(e) => setBookForm({ ...bookForm, appointmentDate: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Appointment Time</label>
                                        <input
                                            type="time"
                                            className="pm-input"
                                            value={bookForm.appointmentTime}
                                            onChange={(e) => setBookForm({ ...bookForm, appointmentTime: e.target.value })}
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Consultation Fee (₹)</label>
                                        <input
                                            type="number"
                                            className="pm-input"
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
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI / QR Code</option>
                                            <option value="Card">Debit / Credit Card</option>
                                            <option value="Online">Online Transfer</option>
                                        </select>
                                    </div>

                                    <div className="pm-form-group full-width">
                                        <label className="pm-label">Clinical Notes / Purpose of Visit</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. Mild fever and sore throat"
                                            value={bookForm.notes}
                                            onChange={(e) => setBookForm({ ...bookForm, notes: e.target.value })}
                                        />
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
                                >
                                    {submittingBook ? 'Booking...' : 'Confirm Appointment'}
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
                    <div className="pm-modal-card pm-modal-large" role="dialog" aria-modal="true" data-scrollable="true">
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Patient Profile & Clinical Record</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={closeProfileModal}
                            >
                                <FiX />
                            </button>
                        </div>

                        <div className="pm-modal-body" data-lenis-prevent data-scrollable="true">
                            {loadingDetails || !patientDetails ? (
                                <div className="pm-empty-state">Loading patient records...</div>
                            ) : (
                                <>
                                    {/* Patient Demographics Strip */}
                                    <div className="pm-profile-header-strip">
                                        <div>
                                            <div className="pm-profile-patient-name">
                                                {patientDetails.patient?.name || 'Patient'}
                                            </div>
                                            <div className="pm-profile-meta">
                                                <span>UID: <strong>{patientDetails.patient?.patientId || patientDetails.patient?.patientUid || 'N/A'}</strong></span>
                                                <span> • Phone: {patientDetails.patient?.phone || 'N/A'}</span>
                                                {patientDetails.patient?.age && <span> • Age: {patientDetails.patient.age} Yrs</span>}
                                                {patientDetails.patient?.gender && <span> ({patientDetails.patient.gender})</span>}
                                                {patientDetails.patient?.bloodGroup && <span> • Blood: {patientDetails.patient.bloodGroup}</span>}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className="pm-action-btn-primary"
                                            style={{ padding: '8px 14px', fontSize: '12.5px' }}
                                            onClick={() => setProfileTab('prescribe')}
                                        >
                                            <FiPlus />
                                            <span>Write Prescription</span>
                                        </button>
                                    </div>

                                    {/* Tabs */}
                                    <div className="pm-tabs-bar">
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'overview' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('overview')}
                                        >
                                            Overview & History
                                        </button>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'prescriptions' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('prescriptions')}
                                        >
                                            Prescriptions ({patientDetails.prescriptions?.length || 0})
                                        </button>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'prescribe' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('prescribe')}
                                        >
                                            ✍️ Prescribe Now
                                        </button>
                                    </div>

                                    {/* TAB 1: OVERVIEW & HISTORY */}
                                    {profileTab === 'overview' && (
                                        <div>
                                            <div className="pm-form-grid" style={{ marginBottom: '20px' }}>
                                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>KNOWN ALLERGIES</span>
                                                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: patientDetails.patient?.allergies ? '#dc2626' : '#1e293b' }}>
                                                        {patientDetails.patient?.allergies || 'None reported'}
                                                    </p>
                                                </div>

                                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>CHRONIC CONDITIONS</span>
                                                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#1e293b' }}>
                                                        {patientDetails.patient?.chronicConditions || 'None reported'}
                                                    </p>
                                                </div>
                                            </div>

                                            <h4 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 12px', color: '#0f172a' }}>
                                                Consultation History ({patientDetails.appointments?.length || 0} Visits)
                                            </h4>

                                            {(!patientDetails.appointments || patientDetails.appointments.length === 0) ? (
                                                <p style={{ color: '#64748b', fontSize: '13px' }}>No previous consultations on record.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {patientDetails.appointments.map((appt) => (
                                                        <div key={appt._id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '10px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                                                    {new Date(appt.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                </span>
                                                                <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                                    {appt.status?.toUpperCase() || 'COMPLETED'}
                                                                </span>
                                                            </div>
                                                            {appt.diagnosis && (
                                                                <p style={{ margin: '6px 0 2px', fontSize: '12.5px', color: '#334155' }}>
                                                                    <strong>Diagnosis:</strong> {appt.diagnosis}
                                                                </p>
                                                            )}
                                                            {appt.doctorNotes && (
                                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                                                    <strong>Notes:</strong> {appt.doctorNotes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB 2: PRESCRIPTIONS LIST & DOWNLOAD */}
                                    {profileTab === 'prescriptions' && (
                                        <div>
                                            {(!patientDetails.prescriptions || patientDetails.prescriptions.length === 0) ? (
                                                <p style={{ color: '#64748b', fontSize: '13px' }}>No prescriptions issued yet.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {patientDetails.prescriptions.map((rx, idx) => (
                                                        <div key={idx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '16px', borderRadius: '12px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                <div>
                                                                    <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                                                                        Prescription Date: {new Date(rx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </strong>
                                                                    {rx.diagnosis && <span style={{ marginLeft: '12px', color: '#0d9488', fontWeight: 600 }}>• {rx.diagnosis}</span>}
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
                                                                <table className="pm-meds-table">
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
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB 3: WRITE PRESCRIPTION */}
                                    {profileTab === 'prescribe' && (
                                        <div>
                                            {rxNotice && (
                                                <div style={{ background: rxNotice.includes('✓') ? '#ecfdf5' : '#fef2f2', color: rxNotice.includes('✓') ? '#047857' : '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                                    {rxNotice}
                                                </div>
                                            )}

                                            <div className="pm-form-grid" style={{ marginBottom: '16px' }}>
                                                <div className="pm-form-group full-width">
                                                    <label className="pm-label">Clinical Diagnosis *</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. Acute Bronchitis / Viral Pharyngitis"
                                                        value={rxForm.diagnosis}
                                                        onChange={(e) => setRxForm({ ...rxForm, diagnosis: e.target.value })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Blood Pressure (BP)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 120/80"
                                                        value={rxForm.vitals.bp}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, bp: e.target.value } })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Pulse (bpm)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 74"
                                                        value={rxForm.vitals.pulse}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, pulse: e.target.value } })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Temperature (°F)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 98.6"
                                                        value={rxForm.vitals.temp}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, temp: e.target.value } })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Weight (kg)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 68"
                                                        value={rxForm.vitals.weight}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, weight: e.target.value } })}
                                                    />
                                                </div>
                                            </div>

                                            <label className="pm-label">Prescribed Medicines</label>
                                            <table className="pm-meds-table">
                                                <thead>
                                                    <tr>
                                                        <th>Medicine Name</th>
                                                        <th>Dosage</th>
                                                        <th>Frequency</th>
                                                        <th>Duration</th>
                                                        <th>Instructions</th>
                                                        <th style={{ width: '40px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rxForm.medicines.map((m, idx) => (
                                                        <tr key={idx}>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="e.g. Tab Paracetamol 650mg"
                                                                    value={m.medicineName}
                                                                    onChange={(e) => handleRxMedChange(idx, 'medicineName', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="1 tab"
                                                                    value={m.dosage}
                                                                    onChange={(e) => handleRxMedChange(idx, 'dosage', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="1-0-1"
                                                                    value={m.frequency}
                                                                    onChange={(e) => handleRxMedChange(idx, 'frequency', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="5 days"
                                                                    value={m.duration}
                                                                    onChange={(e) => handleRxMedChange(idx, 'duration', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="After food"
                                                                    value={m.instructions}
                                                                    onChange={(e) => handleRxMedChange(idx, 'instructions', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                {rxForm.medicines.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '15px' }}
                                                                        onClick={() => handleRemoveRxMedicine(idx)}
                                                                    >
                                                                        <FiTrash2 />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            <button
                                                type="button"
                                                className="pm-add-med-btn"
                                                onClick={handleAddRxMedicine}
                                            >
                                                + Add Another Medicine
                                            </button>

                                            <div className="pm-form-grid">
                                                <div className="pm-form-group full-width">
                                                    <label className="pm-label">Doctor Advice / Diet Instructions</label>
                                                    <textarea
                                                        className="pm-textarea"
                                                        rows="2"
                                                        placeholder="e.g. Drink plenty of warm fluids, rest for 3 days."
                                                        value={rxForm.doctorNotes}
                                                        onChange={(e) => setRxForm({ ...rxForm, doctorNotes: e.target.value })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Follow-Up Revisit Date (Optional)</label>
                                                    <input
                                                        type="date"
                                                        className="pm-input"
                                                        value={rxForm.followUpDate}
                                                        onChange={(e) => setRxForm({ ...rxForm, followUpDate: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                                                <button
                                                    type="button"
                                                    className="pm-btn-primary"
                                                    disabled={savingRx}
                                                    onClick={() => handleSavePrescription(false)}
                                                >
                                                    {savingRx ? 'Saving...' : 'Save Prescription'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="pm-btn-primary"
                                                    style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                                                    disabled={savingRx}
                                                    onClick={() => handleSavePrescription(true)}
                                                >
                                                    <FiDownload style={{ marginRight: '6px' }} />
                                                    {savingRx ? 'Saving...' : 'Save & Download PDF 📄'}
                                                </button>
                                            </div>
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

