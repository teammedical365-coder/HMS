import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import './PatientMonitoring.css';
import './RevisitSchedule.css';
import toast from 'react-hot-toast';
import CustomSelect from '../../components/common/CustomSelect';
import { updateModalScrollLock } from '../../utils/modalScrollLock';

const getAvailableHours = (dateStr, todayStr) => {
    const isToday = dateStr === todayStr;
    const now = new Date();
    const curH = now.getHours();
    const startHour = isToday ? curH : 8;
    const endHour = 22;
    const actualEnd = Math.max(endHour, isToday ? curH : endHour);

    const hours = [];
    for (let h = startHour; h <= actualEnd; h++) {
        const val = String(h).padStart(2, '0');
        const h12 = h % 12 === 0 ? 12 : h % 12;
        const ampm = h >= 12 ? 'PM' : 'AM';
        hours.push({
            value: val,
            label: `${String(h12).padStart(2, '0')}:00 ${ampm} (${val}:00)`
        });
    }
    if (hours.length === 0) {
        const val = String(curH).padStart(2, '0');
        hours.push({ value: val, label: `${val}:00` });
    }
    return hours;
};

const getAvailableMinutes = (dateStr, selectedHour, todayStr) => {
    const isToday = dateStr === todayStr;
    const now = new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const allMins = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

    if (isToday && Number(selectedHour) === curH) {
        const filtered = allMins.filter(m => Number(m) >= curM);
        if (filtered.length > 0) {
            return filtered.map(m => ({ value: m, label: `${m} min` }));
        }
        const curMStr = String(curM).padStart(2, '0');
        return [{ value: curMStr, label: `${curMStr} min` }];
    }
    return allMins.map(m => ({ value: m, label: `${m} min` }));
};

const getValidSlotTime = (dateStr, currentSlotTime, todayStr) => {
    const now = new Date();
    const curH = now.getHours();
    const curM = now.getMinutes();
    const isToday = dateStr === todayStr;

    if (!isToday) {
        return currentSlotTime || '10:00';
    }

    let [h, m] = (currentSlotTime || '').split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
        h = curH;
        m = Math.ceil(curM / 5) * 5;
    }

    if (h < curH) {
        h = curH;
        m = Math.ceil(curM / 5) * 5;
    } else if (h === curH && m < curM) {
        m = Math.ceil(curM / 5) * 5;
    }

    if (m >= 60) {
        h += 1;
        m = 0;
    }
    if (h >= 24) h = 23;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

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
                toast.success('Revisit scheduled successfully!');
            } else {
                toast.error(res.message || 'Failed to schedule revisit');
                setScheduleError(res.message || 'Failed to schedule revisit');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Error scheduling revisit';
            toast.error(msg);
            setScheduleError(msg);
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

    const hasOpenModal = Boolean((bookModal.open && bookModal.appt) || newScheduleModal.open);

    useEffect(() => {
        updateModalScrollLock();
        return () => {
            updateModalScrollLock();
        };
    }, [hasOpenModal]);

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
                toast.success('Revisit appointment booked successfully!');
            } else {
                toast.error(res.message || 'Failed to book revisit appointment');
                setBookError(res.message || 'Failed to book revisit appointment');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Error booking revisit';
            toast.error(msg);
            setBookError(msg);
        } finally {
            setBooking(false);
        }
    };

    // Time slot calculations for Revisit Book Modal
    const isRevisitToday = bookModal.date === todayStr;
    const [revisitHourRaw, revisitMinuteRaw] = (bookModal.time || '10:00').split(':');
    const revisitHourOptions = getAvailableHours(bookModal.date, todayStr);
    const validRevisitHour = revisitHourOptions.some(h => h.value === revisitHourRaw)
        ? revisitHourRaw
        : (revisitHourOptions[0]?.value || '10');
    const revisitMinuteOptions = getAvailableMinutes(bookModal.date, validRevisitHour, todayStr);
    const validRevisitMinute = revisitMinuteOptions.some(m => m.value === revisitMinuteRaw)
        ? revisitMinuteRaw
        : (revisitMinuteOptions[0]?.value || '00');

    const handleRevisitHourChange = (newHour) => {
        const availMins = getAvailableMinutes(bookModal.date, newHour, todayStr);
        let newMin = validRevisitMinute;
        if (!availMins.some(m => m.value === newMin)) {
            newMin = availMins[0]?.value || '00';
        }
        setBookModal(prev => ({ ...prev, time: `${newHour}:${newMin}` }));
    };

    const handleRevisitMinuteChange = (newMin) => {
        setBookModal(prev => ({ ...prev, time: `${validRevisitHour}:${newMin}` }));
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
                    <span>Schedule New Revisit</span>
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
            {bookModal.open && bookModal.appt && createPortal(
                <div className="rs-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rs-book-modal-title">
                    <div className="rs-modal-card rs-modal-card--book">
                        <div className="rs-modal-header">
                            <h3 id="rs-book-modal-title" className="rs-modal-title">Book Follow-up Revisit</h3>
                            <button
                                type="button"
                                className="rs-modal-close-btn"
                                aria-label="Close modal"
                                onClick={() => setBookModal({ open: false, appt: null, date: todayStr, time: '10:00', notes: '' })}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form className="rs-modal-form" onSubmit={handleBookSubmit}>
                            <div className="rs-modal-body" data-lenis-prevent>
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
                                        <label className="pm-label">
                                            Appointment Time Slot * <span style={{ fontSize: '11px', color: '#0d9488', fontWeight: 600 }}>{isRevisitToday ? '(Current Time Onwards)' : '(Clinic Hours)'}</span>
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '8px' }}>
                                            <CustomSelect
                                                className="custom-select-compact"
                                                maxVisibleItems={4}
                                                value={validRevisitHour}
                                                options={revisitHourOptions}
                                                onChange={(e) => handleRevisitHourChange(e.target.value)}
                                            />
                                            <CustomSelect
                                                className="custom-select-compact"
                                                maxVisibleItems={4}
                                                value={validRevisitMinute}
                                                options={revisitMinuteOptions}
                                                onChange={(e) => handleRevisitMinuteChange(e.target.value)}
                                            />
                                        </div>
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

                            <div className="rs-modal-footer">
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
                </div>,
                document.body
            )}
            {/* ─────────────────────────────────────────────────────────────
               SCHEDULE NEW REVISIT MODAL
               ───────────────────────────────────────────────────────────── */}
            {newScheduleModal.open && createPortal(
                <div className="rs-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rs-schedule-modal-title">
                    <div className="rs-modal-card">
                        <div className="rs-modal-header">
                            <div>
                                <h3 id="rs-schedule-modal-title" className="rs-modal-title">Schedule Patient Revisit</h3>
                                <p className="rs-modal-subtitle">
                                    Set an upcoming follow-up visit for an existing patient
                                </p>
                            </div>
                            <button
                                type="button"
                                className="rs-modal-close-btn"
                                aria-label="Close modal"
                                onClick={() => {
                                    setNewScheduleModal({ open: false, query: '', patientId: '', patientName: '', date: todayStr, notes: '' });
                                    setPatientSearchResults([]);
                                    setScheduleError('');
                                }}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form className="rs-modal-form" onSubmit={handleCreateRevisitSchedule}>
                            <div className="rs-modal-body" data-lenis-prevent>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '6px' }}>
                                            <label className="pm-label" style={{ margin: 0 }}>
                                                Revisit Follow-up Date *
                                            </label>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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

                            <div className="rs-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => {
                                        setNewScheduleModal({ open: false, query: '', patientId: '', patientName: '', date: todayStr, notes: '' });
                                        setPatientSearchResults([]);
                                        setScheduleError('');
                                    }}
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
                </div>,
                document.body
            )}
        </div>
    );
};

export default RevisitSchedule;

