import React, { useState, useEffect, useCallback } from 'react';
import { freeOpdAPI } from '../../utils/api';
import {
    FiClock,
    FiCalendar,
    FiCheckCircle,
    FiAlertCircle,
    FiPlus,
    FiX,
    FiSearch
} from 'react-icons/fi';
import './AppointmentManagement.css';

const RevisitSchedule = () => {
    const todayStr = new Date().toISOString().split('T')[0];

    const [revisits, setRevisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'today', 'upcoming', 'overdue'

    // Book Revisit Modal State
    const [bookModal, setBookModal] = useState({ open: false, appt: null, date: todayStr, time: '10:00', notes: '' });
    const [booking, setBooking] = useState(false);
    const [bookError, setBookError] = useState('');

    const loadRevisits = useCallback(async () => {
        setLoading(true);
        try {
            const res = await freeOpdAPI.getRevisits({ filter: activeFilter });
            if (res.success) {
                setRevisits(res.revisits || []);
            }
        } catch (err) {
            console.error('Error fetching revisits:', err);
        } finally {
            setLoading(false);
        }
    }, [activeFilter]);

    useEffect(() => {
        loadRevisits();
    }, [loadRevisits]);

    const handleOpenBook = (appt) => {
        const defaultDate = appt.followUpDate ? appt.followUpDate.split('T')[0] : todayStr;
        setBookError('');
        setBookModal({
            open: true,
            appt,
            date: defaultDate,
            time: '10:00',
            notes: `Follow-up visit for ${appt.diagnosis || 'OPD consultation'}`
        });
    };

    const handleBookSubmit = async (e) => {
        e.preventDefault();
        setBookError('');
        setBooking(true);
        try {
            const res = await freeOpdAPI.bookRevisitAppointment(bookModal.appt.originalAppointmentId || bookModal.appt._id, {
                appointmentDate: bookModal.date,
                appointmentTime: bookModal.time,
                notes: bookModal.notes
            });

            if (res.success) {
                setBookModal({ open: false, appt: null, date: todayStr, time: '10:00', notes: '' });
                loadRevisits();
                alert('✓ Revisit appointment booked successfully!');
            } else {
                setBookError(res.message || 'Failed to book revisit appointment');
            }
        } catch (err) {
            setBookError(err.response?.data?.message || err.message || 'Error booking revisit');
        } finally {
            setBooking(false);
        }
    };

    return (
        <div className="am-container">
            {/* Header Toolbar & Tabs */}
            <div className="am-controls" style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`pm-tab-btn ${activeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('all')}
                    >
                        All Follow-ups
                    </button>
                    <button
                        type="button"
                        className={`pm-tab-btn ${activeFilter === 'today' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('today')}
                    >
                        Today's Revisits
                    </button>
                    <button
                        type="button"
                        className={`pm-tab-btn ${activeFilter === 'upcoming' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('upcoming')}
                    >
                        Upcoming Revisits
                    </button>
                    <button
                        type="button"
                        className={`pm-tab-btn ${activeFilter === 'overdue' ? 'active' : ''}`}
                        onClick={() => setActiveFilter('overdue')}
                    >
                        Overdue Revisits
                    </button>
                </div>
            </div>

            {/* Revisits Master Table */}
            <div className="am-table-card">
                <div className="am-table-wrap">
                    <table className="am-table">
                        <thead>
                            <tr>
                                <th>Scheduled Revisit Date</th>
                                <th>Patient Name</th>
                                <th>Patient UID / Mobile</th>
                                <th>Last Visit Diagnosis</th>
                                <th>Doctor Advice</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        Loading revisit schedules...
                                    </td>
                                </tr>
                            ) : revisits.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        No revisit follow-ups found for the selected filter.
                                    </td>
                                </tr>
                            ) : (
                                revisits.map((item) => {
                                    const followDate = item.followUpDate 
                                        ? new Date(item.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : '—';
                                    const isPast = item.followUpDate && new Date(item.followUpDate) < new Date(todayStr);

                                    return (
                                        <tr key={item._id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <FiCalendar style={{ color: isPast ? '#ef4444' : '#0d9488' }} />
                                                    <strong>{followDate}</strong>
                                                </div>
                                                {isPast && (
                                                    <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700 }}>
                                                        Overdue Follow-up
                                                    </span>
                                                )}
                                            </td>
                                            <td><strong>{item.patientName}</strong></td>
                                            <td>
                                                <span className="pm-patient-id-badge">{item.patientCode}</span>
                                                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{item.patientPhone || '—'}</div>
                                            </td>
                                            <td>
                                                <strong style={{ color: '#0f172a' }}>
                                                    {item.diagnosis || 'Routine Checkup'}
                                                </strong>
                                            </td>
                                            <td style={{ fontSize: '12px', color: '#475569', maxWidth: '240px' }}>
                                                {item.notes || '—'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="pm-action-btn-primary"
                                                    style={{ padding: '6px 12px', fontSize: '12px', margin: '0 auto' }}
                                                    onClick={() => handleOpenBook(item)}
                                                >
                                                    <FiPlus />
                                                    <span>Book Revisit Appointment</span>
                                                </button>
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
               BOOK REVISIT APPOINTMENT MODAL
               ───────────────────────────────────────────────────────────── */}
            {bookModal.open && bookModal.appt && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" style={{ maxWidth: '480px' }}>
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Book Follow-up Revisit</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setBookModal({ open: false, appt: null, date: todayStr, time: '10:00', notes: '' })}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleBookSubmit}>
                            <div className="pm-modal-body">
                                {bookError && (
                                    <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                        ⚠ {bookError}
                                    </div>
                                )}

                                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', padding: '12px', borderRadius: '10px', marginBottom: '14px' }}>
                                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{bookModal.appt.patientName}</div>
                                    <div style={{ fontSize: '12px', color: '#0f766e', marginTop: '2px' }}>
                                        UID: {bookModal.appt.patientCode} • Ph: {bookModal.appt.patientPhone || 'N/A'}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div>
                                        <label className="pm-label">Appointment Date *</label>
                                        <input
                                            type="date"
                                            className="pm-input"
                                            value={bookModal.date}
                                            onChange={(e) => setBookModal({ ...bookModal, date: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="pm-label">Appointment Time</label>
                                        <input
                                            type="time"
                                            className="pm-input"
                                            value={bookModal.time}
                                            onChange={(e) => setBookModal({ ...bookModal, time: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="pm-label">Follow-up Notes / Instructions</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            value={bookModal.notes}
                                            onChange={(e) => setBookModal({ ...bookModal, notes: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setBookModal({ open: false, appt: null, date: todayStr, time: '10:00', notes: '' })}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pm-btn-primary"
                                    disabled={booking}
                                >
                                    {booking ? 'Booking...' : 'Confirm Revisit Slot'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RevisitSchedule;

