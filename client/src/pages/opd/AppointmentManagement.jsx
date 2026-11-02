import React, { useState, useEffect, useCallback } from 'react';
import { freeOpdAPI } from '../../utils/api';
import {
    FiCalendar,
    FiPlus,
    FiSearch,
    FiClock,
    FiEdit2,
    FiXCircle,
    FiCheckCircle,
    FiX,
    FiUserPlus
} from 'react-icons/fi';
import './AppointmentManagement.css';

const AppointmentManagement = () => {
    const todayStr = new Date().toISOString().split('T')[0];

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
                                            <td><strong>{pName}</strong></td>
                                            <td>
                                                <span className="pm-patient-id-badge">{pUid}</span>
                                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{pPhone}</div>
                                            </td>
                                            <td>{appt.visitType || 'OPD Consult'}</td>
                                            <td>₹{appt.amount || 0}</td>
                                            <td>
                                                <span className={`am-status-badge am-status-${appt.status}`}>
                                                    {appt.status?.toUpperCase() || 'CONFIRMED'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
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
        </div>
    );
};

export default AppointmentManagement;

