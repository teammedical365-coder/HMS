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

    // Quick Schedule Follow-up Revisit Modal State
    const [newScheduleModal, setNewScheduleModal] = useState({ open: false, query: '', patientId: '', patientName: '', date: todayStr, notes: '' });
    const [patientSearchResults, setPatientSearchResults] = useState([]);
    const [schedulingRevisit, setSchedulingRevisit] = useState(false);
    const [scheduleError, setScheduleError] = useState('');

    const handlePatientSearch = async (q) => {
        setNewScheduleModal(prev => ({ ...prev, query: q }));
        if (q.trim().length >= 2) {
            try {
                const res = await freeOpdAPI.searchPatients({ query: q.trim(), limit: 5 });
                if (res.success) {
                    setPatientSearchResults(res.patients || []);
                }
            } catch (_) {}
        } else {
            setPatientSearchResults([]);
        }
    };

    const handleCreateRevisitSchedule = async (e) => {
        e.preventDefault();
        setScheduleError('');
        if (!newScheduleModal.patientId) {
            setScheduleError('Please search and select a patient');
            return;
        }
        if (newScheduleModal.date < todayStr) {
            setScheduleError('Revisit date cannot be in the past');
            return;
        }

        setSchedulingRevisit(true);
        try {
            const res = await freeOpdAPI.createAppointment({
                patientId: newScheduleModal.patientId,
                appointmentDate: newScheduleModal.date,
                appointmentTime: '10:00',
                visitType: 'Follow-up',
                notes: newScheduleModal.notes || 'Scheduled follow-up consultation',
                amount: 0,
                paymentMethod: 'Cash'
            });

            if (res.success) {
                setNewScheduleModal({ open: false, query: '', patientId: '', patientName: '', date: todayStr, notes: '' });
                setPatientSearchResults([]);
                loadRevisits();
                alert('✓ Revisit scheduled successfully!');
            } else {
                setScheduleError(res.message || 'Failed to schedule revisit');
            }
        } catch (err) {
            setScheduleError(err.response?.data?.message || err.message || 'Error scheduling revisit');
        } finally {
            setSchedulingRevisit(false);
        }
    };
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

        // Strict Validation: disallow past date
        if (bookModal.date < todayStr) {
            setBookError('Revisit date cannot be in the past');
            return;
        }

        // Strict Validation: disallow past time if today
        if (bookModal.date === todayStr && bookModal.time) {
            const [h, m] = bookModal.time.split(':').map(Number);
            const now = new Date();
            if (h < now.getHours() || (h === now.getHours() && m < now.getMinutes())) {
                const curStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                setBookError(`Revisit time cannot be in the past for today. Current time is ${curStr}`);
                return;
            }
        }

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
            <div className="am-controls" style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
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

                <button
                    type="button"
                    className="pm-action-btn-primary"
                    onClick={() => {
                        setScheduleError('');
                        setNewScheduleModal({ open: true, query: '', patientId: '', patientName: '', date: todayStr, notes: '' });
                    }}
                >
                    <FiPlus />
                    <span>+ Schedule New Revisit</span>
                </button>
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
                                        <label className="pm-label">Appointment Date * <span style={{ fontSize: '11px', color: '#0d9488' }}>(Today or Future)</span></label>
                                        <input
                                            type="date"
                                            className="pm-input"
                                            min={todayStr}
                                            value={bookModal.date}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v < todayStr) {
                                                    setBookError('Revisit date cannot be in the past');
                                                    setBookModal({ ...bookModal, date: todayStr });
                                                } else {
                                                    setBookError('');
                                                    setBookModal({ ...bookModal, date: v });
                                                }
                                            }}
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
            {/* ─────────────────────────────────────────────────────────────
               SCHEDULE NEW REVISIT MODAL
               ───────────────────────────────────────────────────────────── */}
            {newScheduleModal.open && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" style={{ maxWidth: '540px' }}>
                        <div className="pm-modal-header">
                            <div>
                                <h3 className="pm-modal-title" style={{ margin: 0 }}>Schedule Patient Revisit</h3>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                    Set an upcoming follow-up visit for an existing patient
                                </p>
                            </div>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setNewScheduleModal({ open: false, query: '', patientId: '', patientName: '', date: todayStr, notes: '' })}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleCreateRevisitSchedule}>
                            <div className="pm-modal-body">
                                {scheduleError && (
                                    <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                        ⚠ {scheduleError}
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {/* Patient Search */}
                                    <div style={{ position: 'relative' }}>
                                        <label className="pm-label">Search Patient (Name, Mobile or UID) *</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="Type patient name, phone or UID..."
                                            value={newScheduleModal.query}
                                            onChange={(e) => handlePatientSearch(e.target.value)}
                                            required
                                        />

                                        {newScheduleModal.patientName && (
                                            <div style={{ marginTop: '6px', fontSize: '12px', color: '#0d9488', fontWeight: 700 }}>
                                                ✓ Selected: {newScheduleModal.patientName}
                                            </div>
                                        )}

                                        {patientSearchResults.length > 0 && !newScheduleModal.patientName && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 14px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '180px', overflowY: 'auto' }}>
                                                {patientSearchResults.map(p => (
                                                    <div
                                                        key={p._id}
                                                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12.5px' }}
                                                        onMouseDown={() => {
                                                            setNewScheduleModal(prev => ({
                                                                ...prev,
                                                                patientId: p._id,
                                                                patientName: `${p.name} (${p.patientId || p.patientUid || 'UID'} • ${p.phone})`,
                                                                query: p.name
                                                            }));
                                                            setPatientSearchResults([]);
                                                        }}
                                                    >
                                                        <strong>{p.name}</strong> • {p.patientId || p.patientUid} • {p.phone}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Revisit Date with Quick Buttons */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <label className="pm-label" style={{ margin: 0 }}>
                                                Revisit Follow-up Date *
                                            </label>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    style={{ fontSize: '11px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                                    onClick={() => {
                                                        const d = new Date();
                                                        d.setDate(d.getDate() + 3);
                                                        setNewScheduleModal(prev => ({ ...prev, date: d.toISOString().split('T')[0] }));
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
                                                        setNewScheduleModal(prev => ({ ...prev, date: d.toISOString().split('T')[0] }));
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
                                                        setNewScheduleModal(prev => ({ ...prev, date: d.toISOString().split('T')[0] }));
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
                                            value={newScheduleModal.date}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v < todayStr) {
                                                    setScheduleError('Revisit date cannot be in the past');
                                                    setNewScheduleModal(prev => ({ ...prev, date: todayStr }));
                                                } else {
                                                    setScheduleError('');
                                                    setNewScheduleModal(prev => ({ ...prev, date: v }));
                                                }
                                            }}
                                            required
                                        />
                                    </div>

                                    {/* Clinical Advice / Purpose */}
                                    <div>
                                        <label className="pm-label">Follow-up Clinical Advice / Purpose</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. Review blood pressure, check test reports"
                                            value={newScheduleModal.notes}
                                            onChange={(e) => setNewScheduleModal(prev => ({ ...prev, notes: e.target.value }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setNewScheduleModal({ open: false, query: '', patientId: '', patientName: '', date: todayStr, notes: '' })}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pm-btn-primary"
                                    disabled={schedulingRevisit}
                                >
                                    {schedulingRevisit ? 'Scheduling...' : 'Save Revisit Schedule'}
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

