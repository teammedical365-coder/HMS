import React, { useState, useEffect } from 'react';
import { publicAPI } from '../utils/api';
import './SlotPicker.css';

const TIME_SLOTS = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30'
];

const isSlotInPast = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return false;
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    const slotDate = new Date(dateStr);
    slotDate.setHours(hours, minutes, 0, 0);
    return slotDate < now;
};

const SlotPicker = ({ doctorId, date, selectedTime, onSelectTime }) => {
    const [bookedSlots, setBookedSlots] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!doctorId || !date) {
            setBookedSlots([]);
            return;
        }
        
        const fetchSlots = async () => {
            setLoading(true);
            try {
                const res = await publicAPI.getBookedSlots(doctorId, date);
                if (res.success) {
                    setBookedSlots(res.bookedSlots || []);
                }
            } catch (err) {
                console.error('Failed to fetch booked slots', err);
                setBookedSlots([]);
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
        return <div className="slot-picker-message">Loading slots...</div>;
    }

    return (
        <div className="slot-picker-container">
            <div className="slot-picker-legend">
                <div className="legend-item"><span className="legend-box available"></span> Available</div>
                <div className="legend-item"><span className="legend-box booked"></span> Booked</div>
                <div className="legend-item"><span className="legend-box blocked"></span> Past/Blocked</div>
            </div>
            
            <div className="slot-picker-grid">
                {TIME_SLOTS.map(time => {
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
                            title={isBooked ? 'Slot Booked' : isPast ? 'Slot in Past' : 'Click to select'}
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
