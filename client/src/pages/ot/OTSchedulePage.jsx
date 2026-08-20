import React, { useState, useEffect, useCallback } from 'react';
import { 
    FiCalendar, FiClock, FiActivity, FiUsers, FiBox, FiCheckCircle, 
    FiAlertTriangle, FiEye, FiCheck, FiPlus, FiChevronLeft, FiChevronRight, FiEdit2, FiX
} from 'react-icons/fi';
import { otAPI, doctorAPI, bedAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { 
    getStatusStyle, 
    getElapsedTime, 
    checkIfDelayed, 
    SurgeryDetailsModal, 
    ScheduleSurgeryModal, 
    WorkflowBedModal 
} from './OTModals';

const OTSchedulePage = () => {
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [schedule, setSchedule] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [otRoomsList, setOtRoomsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('ALL'); // ALL, DELAYED, SCHEDULED, IN_OT, COMPLETED

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [activePlanToSchedule, setActivePlanToSchedule] = useState(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [bedModal, setBedModal] = useState({ open: false, actionType: null, patientId: null, surgeryId: null });

    const fetchScheduleData = useCallback(async () => {
        setLoading(true);
        try {
            const [scheduleRes, docsRes, roomsRes] = await Promise.all([
                otAPI.getTodaySchedule(selectedDate),
                doctorAPI.getDoctors().catch(() => ({ doctors: [] })),
                otAPI.getRooms().catch(() => ({ rooms: [] }))
            ]);

            if (scheduleRes.success) {
                setSchedule(scheduleRes.schedule || []);
            }
            if (docsRes.doctors) setDoctorsList(docsRes.doctors);
            if (roomsRes.rooms) setOtRoomsList(roomsRes.rooms);

            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch schedule error:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchScheduleData();

        const handleUpdate = () => fetchScheduleData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchScheduleData]);

    const handleDateShift = (days) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    const handleWorkflowTransition = async (surgeryId, nextStatus) => {
        try {
            const res = await otAPI.updateSurgeryWorkflow(surgeryId, { status: nextStatus });
            if (res.success) fetchScheduleData();
        } catch (err) {
            alert(err.response?.data?.message || 'Workflow update failed');
        }
    };

    const handleCancelSurgery = async (surgeryId) => {
        if (!window.confirm('Are you sure you want to cancel this scheduled surgery?')) return;
        try {
            const res = await otAPI.cancelSurgery(surgeryId);
            if (res.success) fetchScheduleData();
        } catch (err) {
            alert(err.response?.data?.message || 'Cancel failed');
        }
    };

    // Filter surgeries
    const filteredSchedule = schedule.filter(s => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const pName = (s.patientId?.name || '').toLowerCase();
            const pMrn = (s.patientId?.mrn || s.patientId?.patientId || '').toLowerCase();
            const proc = (s.surgery || '').toLowerCase();
            const sName = (s.surgeonId?.name || '').toLowerCase();
            const rName = (s.otRoomId?.name || '').toLowerCase();
            if (!pName.includes(q) && !pMrn.includes(q) && !proc.includes(q) && !sName.includes(q) && !rName.includes(q)) {
                return false;
            }
        }

        const isDelayed = checkIfDelayed(s);
        if (activeFilter === 'DELAYED') return isDelayed;
        if (activeFilter === 'SCHEDULED') return s.status === 'SCHEDULED' || s.status === 'ADMITTED';
        if (activeFilter === 'IN_OT') return s.status === 'IN_OT';
        if (activeFilter === 'COMPLETED') return s.status === 'COMPLETED' || s.status === 'SURGERY_COMPLETED';

        return true;
    });

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="OT Schedule & Daily Planning"
                subtitle="Complete daily surgery roster, room allocation, surgeon teams, and real-time intraoperative tracking."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchScheduleData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ today: schedule.length }}
            />

            {/* Date Navigator Bar & Filter Pills */}
            <div style={{ background: '#fff', padding: '18px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                {/* Date Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={() => handleDateShift(-1)}
                        style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        <FiChevronLeft /> Prev Day
                    </button>

                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px', fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}
                    />

                    <button
                        onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                        style={{ padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                        Today
                    </button>

                    <button
                        onClick={() => handleDateShift(1)}
                        style={{ padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                        Next Day <FiChevronRight />
                    </button>
                </div>

                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { id: 'ALL', label: `All (${schedule.length})` },
                        { id: 'DELAYED', label: `Delayed (${schedule.filter(s => checkIfDelayed(s)).length})` },
                        { id: 'SCHEDULED', label: 'Scheduled' },
                        { id: 'IN_OT', label: 'In OT' },
                        { id: 'COMPLETED', label: 'Completed' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setActiveFilter(f.id)}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: 'none',
                                background: activeFilter === f.id ? '#2563eb' : '#f1f5f9',
                                color: activeFilter === f.id ? '#ffffff' : '#475569'
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Schedule Table / List */}
            {filteredSchedule.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiCalendar style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Surgeries Scheduled for this Date</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        Selected Date: <strong>{new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {filteredSchedule.map(s => {
                        const stInfo = getStatusStyle(s.status);
                        const isDelayed = checkIfDelayed(s);
                        const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                        const assistants = s.assistantSurgeonIds || [];
                        const cost = Number(s.surgeryCost) || 0;
                        const paid = Number(s.paidAmount) || 0;
                        const remaining = Math.max(0, cost - paid);

                        return (
                            <div 
                                key={s._id}
                                style={{ 
                                    background: '#ffffff', 
                                    borderRadius: '14px', 
                                    border: `1px solid ${isDelayed ? '#fca5a5' : '#e2e8f0'}`, 
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.03)', 
                                    padding: '18px 22px',
                                    display: 'grid',
                                    gridTemplateColumns: '160px 1fr 180px 220px',
                                    alignItems: 'center',
                                    gap: '18px'
                                }}
                            >
                                {/* Column 1: Time & OT Room */}
                                <div style={{ borderRight: '1px solid #f1f5f9', paddingRight: '14px' }}>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                        ⏰ {s.startTime || '--:--'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        to {s.endTime || '--:--'}
                                    </div>
                                    <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                                        🚪 {s.otRoomId?.name || 'Unassigned OT'}
                                    </div>
                                </div>

                                {/* Column 2: Procedure & Patient & Surgeon Team */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{s.surgery}</span>
                                        <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, background: stInfo.bg, color: stInfo.color, border: `1px solid ${stInfo.border}` }}>
                                            {stInfo.label}
                                        </span>
                                        {isDelayed && (
                                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c' }}>
                                                🚨 DELAYED
                                            </span>
                                        )}
                                    </div>

                                    <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '4px' }}>
                                        👤 <strong>{s.patientId?.name || 'Patient'}</strong> [MRN: {s.patientId?.mrn || s.patientId?.patientId || '-'}]
                                        {s.patientId?.phone && <span style={{ color: '#64748b' }}> • 📞 {s.patientId.phone}</span>}
                                    </div>

                                    <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '4px' }}>
                                        👨‍⚕️ Operating Surgeon: <strong>Dr. {surgeonName}</strong>
                                        {assistants.length > 0 && (
                                            <span style={{ color: '#64748b' }}> • Assistants: {assistants.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Column 3: Billing & Payment Status (Informational) */}
                                <div style={{ borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', padding: '0 14px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                                        BILLING STATUS
                                    </div>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '3px 8px',
                                        borderRadius: '10px',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        background: s.paymentStatus === 'PAID' ? '#dcfce7' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fef3c7' : '#fee2e2'),
                                        color: s.paymentStatus === 'PAID' ? '#15803d' : (s.paymentStatus === 'PARTIALLY PAID' ? '#b45309' : '#b91c1c')
                                    }}>
                                        {s.paymentStatus || 'UNPAID'}
                                    </span>
                                    {cost > 0 && (
                                        <div style={{ fontSize: '0.8rem', color: '#334155', marginTop: '4px' }}>
                                            Fee: <strong>₹{cost.toLocaleString('en-IN')}</strong>
                                            {remaining > 0 ? (
                                                <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>Due: ₹{remaining.toLocaleString('en-IN')}</div>
                                            ) : (
                                                <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>Paid Full</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Column 4: Actions & Step Progression */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => {
                                                setSelectedSurgery(s);
                                                setShowDetailsModal(true);
                                            }}
                                            style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                        >
                                            View
                                        </button>
                                        <button
                                            onClick={() => handleCancelSurgery(s._id)}
                                            style={{ padding: '6px 10px', background: '#fff', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>

                                    {/* Next Step Progression Action */}
                                    {s.status === 'SCHEDULED' && (
                                        <button
                                            onClick={() => {
                                                if (s.admissionRequired) {
                                                    setBedModal({ open: true, actionType: 'ADMIT', patientId: s.patientId?._id, surgeryId: s._id });
                                                } else {
                                                    handleWorkflowTransition(s._id, 'PRE_OP');
                                                }
                                            }}
                                            style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            {s.admissionRequired ? '🏥 Admit Patient' : 'Start Pre-Op →'}
                                        </button>
                                    )}

                                    {s.status === 'ADMITTED' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'PRE_OP')}
                                            style={{ padding: '6px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            Start Pre-Op →
                                        </button>
                                    )}

                                    {s.status === 'PRE_OP' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'READY_FOR_OT')}
                                            style={{ padding: '6px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            Mark Ready for OT →
                                        </button>
                                    )}

                                    {s.status === 'READY_FOR_OT' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'IN_OT')}
                                            style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            🔴 Enter OT →
                                        </button>
                                    )}

                                    {s.status === 'IN_OT' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'SURGERY_COMPLETED')}
                                            style={{ padding: '6px 14px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            ✓ Complete Surgery
                                        </button>
                                    )}

                                    {s.status === 'SURGERY_COMPLETED' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'POST_OP')}
                                            style={{ padding: '6px 14px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            Move to Post-Op →
                                        </button>
                                    )}

                                    {s.status === 'POST_OP' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'COMPLETED')}
                                            style={{ padding: '6px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', width: '100%' }}
                                        >
                                            ✓ Discharge / Finish
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            <SurgeryDetailsModal
                open={showDetailsModal}
                surgery={selectedSurgery}
                onClose={() => {
                    setShowDetailsModal(false);
                    setSelectedSurgery(null);
                }}
            />

            <ScheduleSurgeryModal
                open={showScheduleModal}
                activePlan={activePlanToSchedule}
                doctorsList={doctorsList}
                otRoomsList={otRoomsList}
                onClose={() => {
                    setShowScheduleModal(false);
                    setActivePlanToSchedule(null);
                }}
                onSuccess={() => fetchScheduleData()}
            />

            <WorkflowBedModal
                open={bedModal.open}
                actionType={bedModal.actionType}
                patientId={bedModal.patientId}
                surgeryId={bedModal.surgeryId}
                onClose={() => setBedModal({ open: false, actionType: null, patientId: null, surgeryId: null })}
                onSuccess={() => fetchScheduleData()}
            />
        </div>
    );
};

export default OTSchedulePage;
