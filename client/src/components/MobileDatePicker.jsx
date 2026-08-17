import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const MobileDatePicker = ({ value, onChange, min, max, required, disabled, className, style, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // Parse the current value for the calendar view, default to today
    const parseDate = (dateStr) => {
        if (!dateStr) return new Date();
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }
        return new Date();
    };

    const [currentMonth, setCurrentMonth] = useState(() => parseDate(value));
    const [viewMode, setViewMode] = useState('days'); // 'days', 'months', 'years'
    const [yearPage, setYearPage] = useState(() => parseDate(value).getFullYear());
    
    // Update internal calendar view if external value changes
    useEffect(() => {
        if (value) setCurrentMonth(parseDate(value));
    }, [value]);

    const wrapperRef = useRef(null);
    const popoverRef = useRef(null);

    // Position popover logic (open above if not enough space below)
    const [popoverPosition, setPopoverPosition] = useState({});
    
    useEffect(() => {
        if (isOpen && wrapperRef.current && popoverRef.current) {
            const rect = wrapperRef.current.getBoundingClientRect();
            const popoverHeight = popoverRef.current.offsetHeight || 320;
            const spaceBelow = window.innerHeight - rect.bottom;
            
            if (spaceBelow < popoverHeight && rect.top > popoverHeight) {
                // Open above
                setPopoverPosition({ bottom: '100%', top: 'auto', marginBottom: '8px' });
            } else {
                // Open below
                setPopoverPosition({ top: '100%', bottom: 'auto', marginTop: '8px' });
            }
        }
    }, [isOpen]);

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const generateCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const totalDays = daysInMonth(year, month);
        const firstDay = firstDayOfMonth(year, month); // 0 (Sun) to 6 (Sat)
        
        let days = [];
        let firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1; // Mon = 0, Sun = 6
        days = Array(firstDayAdjusted).fill(null);
        
        for (let i = 1; i <= totalDays; i++) {
            days.push(i);
        }
        return days;
    };

    const handlePrevMonth = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const handleNextMonth = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const handleDateSelect = (day) => {
        if (!day) return;
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const dayStr = String(day).padStart(2, '0');
        const dateString = `${year}-${month}-${dayStr}`;
        
        if (onChange) {
            onChange({ target: { value: dateString } });
        }
        setIsOpen(false);
    };

    const handleToday = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const dayStr = String(today.getDate()).padStart(2, '0');
        if (onChange) onChange({ target: { value: `${year}-${month}-${dayStr}` } });
        setIsOpen(false);
    };

    const handleClear = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onChange) onChange({ target: { value: '' } });
        setIsOpen(false);
    };

    const formatDisplayDate = (val) => {
        if (!val) return '';
        const parts = val.split('-');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
        return val;
    };

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const weekDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

    return (
        <div style={{ position: 'relative', width: '100%' }} ref={wrapperRef}>
            {/* Desktop Native Input */}
            <input
                type="date"
                className={`hide-on-mobile ${className || ''}`}
                value={value || ''}
                onChange={onChange}
                min={min}
                max={max}
                required={required}
                disabled={disabled}
                style={style}
            />

            {/* Mobile Custom Picker */}
            <div className={`show-on-mobile ${className || ''}`} style={{ ...style, position: 'relative' }}>
                <div 
                    className="mobile-date-trigger"
                    onClick={() => {
                        if (!disabled) {
                            setIsOpen(!isOpen);
                            if (!isOpen) setViewMode('days');
                        }
                    }}
                    style={{
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: isOpen ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
                        background: disabled ? '#f1f5f9' : '#fff',
                        fontSize: '15px',
                        color: value ? '#1e293b' : '#94a3b8',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        boxSizing: 'border-box'
                    }}
                >
                    <span>{value ? formatDisplayDate(value) : (placeholder || 'DD-MM-YYYY')}</span>
                    <span style={{ color: '#64748b' }}>📅</span>
                </div>

                {isOpen && createPortal(
                    <>
                        {/* Mobile Modal Backdrop */}
                        <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 99998, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }} 
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} 
                        />
                        <div 
                            ref={popoverRef}
                            className="mobile-calendar-popover"
                            style={{
                                position: 'fixed',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '310px',
                                maxWidth: 'calc(100vw - 32px)',
                                background: '#fff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '16px',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                                zIndex: 99999,
                                padding: '20px',
                                boxSizing: 'border-box'
                            }}
                        >
                        {viewMode === 'days' && (
                            <>
                                <table style={{ width: '100%', marginBottom: '16px', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ textAlign: 'left', width: '20%' }}>
                                                <button type="button" onClick={handlePrevMonth} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#475569' }}>{'<'}</button>
                                            </td>
                                            <td style={{ textAlign: 'center', width: '60%' }}>
                                                <span onClick={() => setViewMode('months')} style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b', cursor: 'pointer', marginRight: '8px' }}>
                                                    {monthNames[currentMonth.getMonth()]}
                                                </span>
                                                <span onClick={() => { setViewMode('years'); setYearPage(currentMonth.getFullYear()); }} style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b', cursor: 'pointer' }}>
                                                    {currentMonth.getFullYear()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', width: '20%' }}>
                                                <button type="button" onClick={handleNextMonth} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#475569' }}>{'>'}</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            {weekDays.map(d => (
                                                <th key={d} style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', paddingBottom: '8px' }}>{d}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: Math.ceil(generateCalendar().length / 7) }).map((_, rowIndex) => (
                                            <tr key={rowIndex}>
                                                {generateCalendar().slice(rowIndex * 7, (rowIndex + 1) * 7).map((day, colIndex) => {
                                                    if (!day) return <td key={`empty-${colIndex}`} style={{ padding: '2px' }} />;
                                                    
                                                    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                                    const isSelected = value === dateStr;
                                                    const isToday = new Date().toISOString().split('T')[0] === dateStr;
                                                    
                                                    let isOutOfRange = false;
                                                    if (min && dateStr < min) isOutOfRange = true;
                                                    if (max && dateStr > max) isOutOfRange = true;

                                                    return (
                                                        <td key={colIndex} style={{ padding: '2px' }}>
                                                            <div
                                                                onClick={() => !isOutOfRange && handleDateSelect(day)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 0',
                                                                    borderRadius: '6px',
                                                                    fontSize: '13px',
                                                                    fontWeight: isSelected ? 700 : 500,
                                                                    color: isOutOfRange ? '#cbd5e1' : (isSelected ? '#fff' : (isToday ? '#6366f1' : '#1e293b')),
                                                                    background: isSelected ? '#6366f1' : 'transparent',
                                                                    cursor: isOutOfRange ? 'not-allowed' : 'pointer',
                                                                    opacity: isOutOfRange ? 0.5 : 1
                                                                }}
                                                            >
                                                                {day}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}

                        {viewMode === 'months' && (
                            <>
                                <table style={{ width: '100%', marginBottom: '16px', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ textAlign: 'left', width: '20%' }}>
                                                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 1))} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#475569' }}>{'<'}</button>
                                            </td>
                                            <td style={{ textAlign: 'center', width: '60%' }}>
                                                <span onClick={() => { setViewMode('years'); setYearPage(currentMonth.getFullYear()); }} style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b', cursor: 'pointer' }}>
                                                    {currentMonth.getFullYear()}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', width: '20%' }}>
                                                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear() + 1, currentMonth.getMonth(), 1))} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#475569' }}>{'>'}</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', tableLayout: 'fixed' }}>
                                    <tbody>
                                        {Array.from({ length: 4 }).map((_, rowIndex) => (
                                            <tr key={rowIndex}>
                                                {monthNames.slice(rowIndex * 3, (rowIndex + 1) * 3).map((m, colIndex) => {
                                                    const i = rowIndex * 3 + colIndex;
                                                    return (
                                                        <td key={m} style={{ padding: '4px' }}>
                                                            <div 
                                                                onClick={() => { setCurrentMonth(new Date(currentMonth.getFullYear(), i, 1)); setViewMode('days'); }}
                                                                style={{
                                                                    padding: '12px 0',
                                                                    borderRadius: '8px',
                                                                    fontSize: '13px',
                                                                    fontWeight: currentMonth.getMonth() === i ? 700 : 500,
                                                                    color: currentMonth.getMonth() === i ? '#fff' : '#1e293b',
                                                                    background: currentMonth.getMonth() === i ? '#6366f1' : '#f8fafc',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                {m.slice(0, 3)}
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}

                        {viewMode === 'years' && (
                            <>
                                <table style={{ width: '100%', marginBottom: '16px', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        <tr>
                                            <td style={{ textAlign: 'left', width: '20%' }}>
                                                <button type="button" onClick={() => setYearPage(yearPage - 12)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#475569' }}>{'<'}</button>
                                            </td>
                                            <td style={{ textAlign: 'center', width: '60%' }}>
                                                <span style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>
                                                    {yearPage - 4} - {yearPage + 7}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right', width: '20%' }}>
                                                <button type="button" onClick={() => setYearPage(yearPage + 12)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#475569' }}>{'>'}</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', tableLayout: 'fixed' }}>
                                    <tbody>
                                        {Array.from({ length: 4 }).map((_, rowIndex) => (
                                            <tr key={rowIndex}>
                                                {Array.from({ length: 3 }, (_, colIndex) => yearPage - 4 + (rowIndex * 3 + colIndex)).map(y => (
                                                    <td key={y} style={{ padding: '4px' }}>
                                                        <div 
                                                            onClick={() => { setCurrentMonth(new Date(y, currentMonth.getMonth(), 1)); setViewMode('months'); }}
                                                            style={{
                                                                padding: '12px 0',
                                                                borderRadius: '8px',
                                                                fontSize: '13px',
                                                                fontWeight: currentMonth.getFullYear() === y ? 700 : 500,
                                                                color: currentMonth.getFullYear() === y ? '#fff' : '#1e293b',
                                                                background: currentMonth.getFullYear() === y ? '#6366f1' : '#f8fafc',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            {y}
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}
                        
                        <table style={{ width: '100%', marginTop: '16px', borderTop: '1px solid #f1f5f9', borderCollapse: 'collapse' }}>
                            <tbody>
                                <tr>
                                    <td style={{ textAlign: 'left', paddingTop: '12px' }}>
                                        <button type="button" onClick={handleClear} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>Clear</button>
                                    </td>
                                    <td style={{ textAlign: 'right', paddingTop: '12px' }}>
                                        <button type="button" onClick={handleToday} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}>Today</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    </>,
                    document.body
                )}
            </div>
        </div>
    );
};

export default MobileDatePicker;
