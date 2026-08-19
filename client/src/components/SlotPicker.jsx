import React, { useState, useEffect } from 'react';
import { publicAPI } from '../utils/api';
import './SlotPicker.css';

const DEFAULT_TIME_SLOTS = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
];

const parseDateRobust = (dateStr) => {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? new Date() : dateStr;
    const str = String(dateStr).trim();
    const dmyMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (dmyMatch) {
        const [_, d, m, y] = dmyMatch;
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`);
    }
    const ymdMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (ymdMatch) {
        const [_, y, m, d] = ymdMatch;
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`);
    }
    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) return new Date();
    return parsed;
};

const isSlotInPast = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return false;
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotDate = parseDateRobust(dateStr);
    slotDate.setHours(hours, minutes, 0, 0);
    return slotDate < now;
};

const SlotPicker = ({ doctorId, date, selectedTime, onSelectTime }) => {
    const [bookedSlots, setBookedSlots] = useState([]);
    const [timeSlots, setTimeSlots] = useState(DEFAULT_TIME_SLOTS);
    const [isAvailable, setIsAvailable] = useState(true);
    const [workingHours, setWorkingHours] = useState({ start: '09:00', end: '17:30', day: '' });
    const [doctorName, setDoctorName] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!doctorId || !date) {
            setBookedSlots([]);
            setTimeSlots(DEFAULT_TIME_SLOTS);
            setIsAvailable(true);
            return;
        }
        
        const fetchSlots = async () => {
            setLoading(true);
            try {
                const res = await publicAPI.getBookedSlots(doctorId, date);
                if (res.success) {
                    setBookedSlots(res.bookedSlots || []);
                    setIsAvailable(res.available !== false);
                    setWorkingHours({
                        start: res.startTime || '09:00',
                        end: res.endTime || '17:30',
                        day: res.dayName || ''
                    });
                    if (res.doctor?.name) {
                        setDoctorName(res.doctor.name);
                    }

                    if (Array.isArray(res.timeSlots) && res.timeSlots.length > 0) {
                        setTimeSlots(res.timeSlots);
                    } else if (res.available === false) {
                        setTimeSlots([]);
                    } else {
                        const start = res.startTime || '09:00';
                        const end = res.endTime || '17:30';
                        const [sH, sM] = start.split(':').map(Number);
                        const [eH, eM] = end.split(':').map(Number);
                        let cur = (sH || 0) * 60 + (sM || 0);
                        const endM = (eH || 0) * 60 + (eM || 0);
                        const genSlots = [];
                        while (cur < endM) {
                            const h = Math.floor(cur / 60);
                            const m = cur % 60;
                            genSlots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
                            cur += 30;
                        }
                        setTimeSlots(genSlots.length > 0 ? genSlots : DEFAULT_TIME_SLOTS);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch booked slots', err);
                setBookedSlots([]);
                setTimeSlots(DEFAULT_TIME_SLOTS);
            } finally {
                setLoading(false);
            }
        };

        fetchSlots();
    }, [doctorId, date]);

    if (!doctorId || !date) {
        return <div className="slot-picker-message">Select a doctor and date to view available slots.</div>;
    }

    if (loading) {
        return <div className="slot-picker-message">Loading doctor's availability & slots...</div>;
    }

    if (!isAvailable) {
        const formattedDay = workingHours.day ? (workingHours.day.charAt(0).toUpperCase() + workingHours.day.slice(1)) : 'this day';
        return (
            <div style={{
                padding: '16px 20px',
                background: '#fff7ed',
                border: '1.5px solid #ffedd5',
                borderRadius: '10px',
                color: '#c2410c',
                margin: '12px 0',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <span style={{ fontSize: '1.8rem' }}>📅</span>
                <div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#9a3412' }}>
                        Doctor Not Available on {formattedDay}s
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#c2410c', marginTop: '2px' }}>
                        {doctorName ? `Dr. ${doctorName.replace(/^Dr\.?\s*/i, '')}` : 'This specialist'} has no scheduled consultation hours on this day. Please select another date.
                    </div>
                </div>
            </div>
        );
    }

    const formattedDay = workingHours.day ? (workingHours.day.charAt(0).toUpperCase() + workingHours.day.slice(1)) : '';

    return (
        <div className="slot-picker-container">
            {/* Working Hours Banner */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 14px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                marginBottom: '12px',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>
                    🕒 Working Hours {formattedDay ? `(${formattedDay})` : ''}: <span style={{ color: '#14532d', fontSize: '0.9rem' }}>{workingHours.start} - {workingHours.end}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>
                    {timeSlots.length} Total Slots (30 min)
                </div>
            </div>

            <div className="slot-picker-legend">
                <div className="legend-item"><span className="legend-box available"></span> Available</div>
                <div className="legend-item"><span className="legend-box booked"></span> Booked</div>
                <div className="legend-item"><span className="legend-box blocked"></span> Past/Blocked</div>
            </div>
            
            <div className="slot-picker-grid">
                {timeSlots.map(time => {
                    const isBooked = bookedSlots.includes(time);
                    const isPast = isSlotInPast(date, time);
                    const isDisabled = isBooked || isPast;
                    const isSelected = selectedTime === time;

                    let className = 'slot-picker-btn';
                    if (isSelected) className += ' selected';
                    else if (isBooked) className += ' booked';
                    else if (isPast) className += ' blocked';
                    else className += ' available';

                    return (
                        <button
                            key={time}
                            type="button"
                            className={className}
                            onClick={() => !isDisabled && onSelectTime(time)}
                            disabled={isDisabled}
                            title={isBooked ? 'Slot Booked' : isPast ? 'Slot in Past' : `Click to book ${time}`}
                        >
                            {time}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default SlotPicker;
