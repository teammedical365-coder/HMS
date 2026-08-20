import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
    FiCalendar, FiClock, FiActivity, FiUsers, FiBox, FiCheckCircle, 
    FiAlertTriangle, FiArrowRight, FiEye, FiCheck, FiPlus, FiFilter
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

const OTDashboard = () => {
    const navigate = useNavigate();

    // Data states
    const [stats, setStats] = useState({
        todaySurgeries: 0,
        upcomingSurgeries: 0,
        plannedPatients: 0,
        preOpPatients: 0,
        postOpPatients: 0,
        occupiedRooms: 0,
        totalRooms: 0
    });
    const [rooms, setRooms] = useState([]);
    const [roomSummary, setRoomSummary] = useState({ available: 0, inOt: 0, delayed: 0, scheduled: 0, total: 0 });
    const [alerts, setAlerts] = useState([]);
    const [todaySchedule, setTodaySchedule] = useState([]);
    const [plannedSurgeries, setPlannedSurgeries] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [otRoomsList, setOtRoomsList] = useState([]);

    // UI states
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modal states
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [activePlanToSchedule, setActivePlanToSchedule] = useState(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [bedModal, setBedModal] = useState({ open: false, actionType: null, patientId: null, surgeryId: null });

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            const [statsRes, roomsRes, alertsRes, scheduleRes, plannedRes, docsRes, allRoomsRes] = await Promise.all([
                otAPI.getDashboardStats(),
                otAPI.getRoomStatus(today),
                otAPI.getWorkflowAlerts(today),
                otAPI.getTodaySchedule(today),
                otAPI.getPlannedSurgeries(),
                doctorAPI.getDoctors().catch(() => ({ doctors: [] })),
                otAPI.getRooms().catch(() => ({ rooms: [] }))
            ]);

            if (statsRes.success) setStats(statsRes.stats);
            if (roomsRes.success) {
                setRooms(roomsRes.rooms || []);
                if (roomsRes.summary) setRoomSummary(roomsRes.summary);
            }
            if (alertsRes.success) setAlerts(alertsRes.alerts || []);
            if (scheduleRes.success) setTodaySchedule(scheduleRes.schedule || []);
            if (plannedRes.success) setPlannedSurgeries(plannedRes.surgeries || []);
            if (docsRes.doctors) setDoctorsList(docsRes.doctors);
            if (allRoomsRes.rooms) setOtRoomsList(allRoomsRes.rooms);

            setLastUpdated(new Date());
        } catch (err) {
            console.error('OT Dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();

        const handleOtUpdate = () => fetchDashboardData();
        socket.on('ot_update', handleOtUpdate);
        socket.on('ot_surgery_scheduled', handleOtUpdate);

        return () => {
            socket.off('ot_update', handleOtUpdate);
            socket.off('ot_surgery_scheduled', handleOtUpdate);
        };
    }, [fetchDashboardData]);

    const handleWorkflowTransition = async (surgeryId, nextStatus) => {
        try {
            const res = await otAPI.updateSurgeryWorkflow(surgeryId, { status: nextStatus });
            if (res.success) fetchDashboardData();
        } catch (err) {
            alert(err.response?.data?.message || 'Workflow transition failed');
        }
    };

    // Calculate badge counts for header
    const inOtCount = todaySchedule.filter(s => s.status === 'IN_OT').length;
    const preOpCount = todaySchedule.filter(s => s.status === 'PRE_OP' || s.status === 'READY_FOR_OT').length;
    const postOpCount = todaySchedule.filter(s => s.status === 'POST_OP').length;
    const completedCount = todaySchedule.filter(s => s.status === 'COMPLETED' || s.status === 'SURGERY_COMPLETED').length;

    // Filter preview records by global search if entered
    const matchesSearch = (item) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const pName = (item.patientId?.name || '').toLowerCase();
        const pMrn = (item.patientId?.mrn || item.patientId?.patientId || '').toLowerCase();
        const proc = (item.surgery || '').toLowerCase();
        const sName = (item.surgeonId?.name || '').toLowerCase();
        const rName = (item.otRoomId?.name || '').toLowerCase();
        const planId = (item.planId || '').toLowerCase();
        return pName.includes(q) || pMrn.includes(q) || proc.includes(q) || sName.includes(q) || rName.includes(q) || planId.includes(q);
    };

    const previewSchedule = todaySchedule.filter(matchesSearch).slice(0, 4);
    const previewRooms = rooms.slice(0, 4);
    const previewPlanned = plannedSurgeries.filter(matchesSearch).slice(0, 4);
    const previewUpcoming = todaySchedule.filter(s => s.status === 'SCHEDULED' && matchesSearch(s)).slice(0, 3);

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            {/* Header & Tabs */}
            <OTHeader
                title="Operation Theatre Command Center"
                subtitle="Real-time operational overview, department KPIs, and quick access modules."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchDashboardData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{
                    planned: stats.plannedPatients,
                    today: stats.todaySurgeries,
                    roomsInUse: roomSummary.inOt,
                    preOp: preOpCount,
                    inOt: inOtCount,
                    postOp: postOpCount,
                    completed: completedCount
                }}
            />

            {/* ========================================================= */}
            {/* 1. KPI SUMMARY SECTION (7 CARDS)                          */}
            {/* ========================================================= */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {/* 1. Today's Surgeries */}
                <div 
                    onClick={() => navigate('/ot/schedule')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#3b82f6' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Today's Surgeries</span>
                        <FiCalendar style={{ color: '#3b82f6', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#0f172a' }}>{stats.todaySurgeries}</div>
                    <div style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        View Schedule <FiArrowRight />
                    </div>
                </div>

                {/* 2. In OT */}
                <div 
                    onClick={() => navigate('/ot/in-progress')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #fee2e2', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#ef4444' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>In OT</span>
                        <FiActivity style={{ color: '#ef4444', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#dc2626' }}>{roomSummary.inOt}</div>
                    <div style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Live In-OT Feed <FiArrowRight />
                    </div>
                </div>

                {/* 3. Available OT Rooms */}
                <div 
                    onClick={() => navigate('/ot/rooms')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #dcfce7', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#22c55e' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Available OT</span>
                        <FiBox style={{ color: '#22c55e', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#16a34a' }}>{roomSummary.available}</div>
                    <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        View Rooms <FiArrowRight />
                    </div>
                </div>

                {/* 4. Occupied OT Rooms */}
                <div 
                    onClick={() => navigate('/ot/rooms')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #fed7aa', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#f97316' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Occupied OT</span>
                        <FiBox style={{ color: '#f97316', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#ea580c' }}>{roomSummary.inOt + roomSummary.scheduled}</div>
                    <div style={{ fontSize: '0.78rem', color: '#ea580c', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Room Board <FiArrowRight />
                    </div>
                </div>

                {/* 5. Pre-Op Patients */}
                <div 
                    onClick={() => navigate('/ot/pre-op')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #fef08a', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#eab308' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Pre-Op Patients</span>
                        <FiUsers style={{ color: '#eab308', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#ca8a04' }}>{preOpCount}</div>
                    <div style={{ fontSize: '0.78rem', color: '#ca8a04', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        View Pre-Op <FiArrowRight />
                    </div>
                </div>

                {/* 6. Completed Today */}
                <div 
                    onClick={() => navigate('/ot/completed')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #c7d2fe', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#6366f1' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Completed Today</span>
                        <FiCheckCircle style={{ color: '#6366f1', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#4f46e5' }}>{completedCount}</div>
                    <div style={{ fontSize: '0.78rem', color: '#4f46e5', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        View History <FiArrowRight />
                    </div>
                </div>

                {/* 7. Planned Surgeries */}
                <div 
                    onClick={() => navigate('/ot/planned')}
                    style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e9d5ff', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative', overflow: 'hidden' }}
                >
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#a855f7' }}></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Planned Surgeries</span>
                        <FiClock style={{ color: '#a855f7', fontSize: '1.2rem' }} />
                    </div>
                    <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#7e22ce' }}>{stats.plannedPatients}</div>
                    <div style={{ fontSize: '0.78rem', color: '#7e22ce', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        Schedule Now <FiArrowRight />
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 2. ATTENTION REQUIRED ALERT CENTER                        */}
            {/* ========================================================= */}
            {alerts.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #fecaca', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)', marginBottom: '24px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', background: '#fef2f2', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiAlertTriangle style={{ color: '#dc2626', fontSize: '1.2rem' }} />
                            <span style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.95rem' }}>
                                Attention Required ({alerts.length} Actionable Alert{alerts.length > 1 ? 's' : ''})
                            </span>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 600 }}>Clinical delays, missing admissions, and schedule conflicts</span>
                    </div>

                    <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                        {alerts.map((alert, idx) => (
                            <div key={idx} style={{ background: '#fff', border: '1px solid #fee2e2', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>
                                        {alert.surgery?.surgery || 'Scheduled Procedure'}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                                        Patient: <strong>{alert.surgery?.patientId?.name || 'Patient'}</strong> | Room: <strong>{alert.surgery?.otRoomId?.name || 'OT'}</strong>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, marginTop: '4px' }}>
                                        ⚠️ {alert.message}
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedSurgery(alert.surgery);
                                        setShowDetailsModal(true);
                                    }}
                                    style={{ padding: '6px 12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                >
                                    View Details
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* 3. TODAY'S OPERATIONS (TWO-COLUMN PREVIEW)                 */}
            {/* ========================================================= */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {/* Left Column: Today's OT Schedule Preview */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📅 Today's OT Schedule
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Showing {previewSchedule.length} of {todaySchedule.length} surgeries scheduled today</span>
                        </div>
                        <Link 
                            to="/ot/schedule"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px' }}
                        >
                            View Full Schedule <FiArrowRight />
                        </Link>
                    </div>

                    {previewSchedule.length === 0 ? (
                        <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px' }}>
                            <FiCalendar style={{ fontSize: '2rem', marginBottom: '6px', color: '#cbd5e1' }} />
                            <div>No surgeries scheduled for today.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {previewSchedule.map(s => {
                                const stInfo = getStatusStyle(s.status);
                                const isDelayed = checkIfDelayed(s);
                                const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                                const assistants = s.assistantSurgeonIds || [];

                                return (
                                    <div key={s._id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{s.surgery}</span>
                                                <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 800, background: stInfo.bg, color: stInfo.color, border: `1px solid ${stInfo.border}` }}>
                                                    {stInfo.label}
                                                </span>
                                                {isDelayed && (
                                                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c' }}>
                                                        DELAYED
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '3px' }}>
                                                👤 <strong>{s.patientId?.name || 'Patient'}</strong> | ⏰ {s.startTime || '--:--'} - {s.endTime || '--:--'} | 🚪 {s.otRoomId?.name || 'Unassigned OT'}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                Surgeon: <strong>Dr. {surgeonName}</strong>
                                                {assistants.length > 0 && (
                                                    <span> • Assistants: {assistants.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}</span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setSelectedSurgery(s);
                                                setShowDetailsModal(true);
                                            }}
                                            style={{ padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        >
                                            View
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right Column: Live OT Room Status Preview */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                🏥 Live OT Room Status
                            </h2>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Showing {previewRooms.length} of {rooms.length} OT suites</span>
                        </div>
                        <Link 
                            to="/ot/rooms"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 700, color: '#2563eb', textDecoration: 'none', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px' }}
                        >
                            View All OT Rooms <FiArrowRight />
                        </Link>
                    </div>

                    {previewRooms.length === 0 ? (
                        <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px' }}>
                            <FiBox style={{ fontSize: '2rem', marginBottom: '6px', color: '#cbd5e1' }} />
                            <div>No OT Rooms registered in this hospital.</div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                            {previewRooms.map(r => {
                                const isOccupied = r.status === 'In OT' || r.status === 'IN_OT';
                                const isAvailable = r.status === 'Available' || r.status === 'AVAILABLE';

                                return (
                                    <div 
                                        key={r._id}
                                        style={{ 
                                            background: isOccupied ? '#fef2f2' : (isAvailable ? '#f0fdf4' : '#eff6ff'),
                                            border: `1px solid ${isOccupied ? '#fecaca' : (isAvailable ? '#bbf7d0' : '#bfdbfe')}`,
                                            borderRadius: '10px',
                                            padding: '14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>🚪 {r.name}</span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 800,
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    background: isOccupied ? '#fee2e2' : (isAvailable ? '#dcfce7' : '#dbeafe'),
                                                    color: isOccupied ? '#b91c1c' : (isAvailable ? '#15803d' : '#1d4ed8')
                                                }}>
                                                    {r.status}
                                                </span>
                                            </div>

                                            {r.currentSurgery ? (
                                                <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                                                    <div><strong>Procedure:</strong> {r.currentSurgery.procedure}</div>
                                                    <div><strong>Surgeon:</strong> Dr. {(r.currentSurgery.surgeon || '').replace(/^Dr\.?\s*/i, '')}</div>
                                                    {r.currentSurgery.elapsedTime && (
                                                        <div style={{ color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>
                                                            ⏱️ Elapsed: {r.currentSurgery.elapsedTime}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                    {r.nextSurgery ? (
                                                        <div>Next: <strong>{r.nextSurgery.procedure}</strong> at {r.nextSurgery.time}</div>
                                                    ) : (
                                                        <div>Ready for immediate scheduling.</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ========================================================= */}
            {/* 4. PLANNED SURGERIES PREVIEW (AWAITING OT SCHEDULING)      */}
            {/* ========================================================= */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', padding: '20px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📋 Planned Surgeries (Awaiting OT Scheduling)
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Showing {previewPlanned.length} of {plannedSurgeries.length} doctor-created surgery plans</span>
                    </div>
                    <Link 
                        to="/ot/planned"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 700, color: '#7c3aed', textDecoration: 'none', background: '#f5f3ff', padding: '6px 14px', borderRadius: '8px' }}
                    >
                        View All Planned Surgeries <FiArrowRight />
                    </Link>
                </div>

                {previewPlanned.length === 0 ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '10px' }}>
                        <FiClock style={{ fontSize: '2rem', marginBottom: '6px', color: '#cbd5e1' }} />
                        <div>No surgery plans awaiting OT scheduling. All planned procedures are booked.</div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                        {previewPlanned.map(plan => {
                            const surgeonName = (plan.surgeonId?.name || plan.doctorId?.name || 'Doctor').replace(/^Dr\.?\s*/i, '');

                            return (
                                <div key={plan._id} style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <span style={{ fontWeight: 800, color: '#581c87', fontSize: '1rem' }}>{plan.surgery}</span>
                                            {plan.planId && (
                                                <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#e9d5ff', color: '#6b21a8', padding: '2px 6px', borderRadius: '4px' }}>
                                                    {plan.planId}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                                            👤 <strong>{plan.patientId?.name || 'Patient'}</strong> [MRN: {plan.patientId?.mrn || plan.patientId?.patientId || '-'}]
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                            Surgeon: <strong>Dr. {surgeonName}</strong> | Pref: {new Date(plan.preferredDate || plan.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #f3e8ff' }}>
                                        <button
                                            onClick={() => {
                                                setSelectedSurgery(plan);
                                                setShowDetailsModal(true);
                                            }}
                                            style={{ padding: '6px 12px', background: '#fff', border: '1px solid #d8b4fe', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#6b21a8', cursor: 'pointer' }}
                                        >
                                            View Plan
                                        </button>
                                        <button
                                            onClick={() => {
                                                setActivePlanToSchedule(plan);
                                                setShowScheduleModal(true);
                                            }}
                                            style={{ padding: '6px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <FiCalendar /> Schedule OT
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modals */}
            <SurgeryDetailsModal
                open={showDetailsModal}
                surgery={selectedSurgery}
                onClose={() => {
                    setShowDetailsModal(false);
                    setSelectedSurgery(null);
                }}
                onOpenScheduleModal={(plan) => {
                    setActivePlanToSchedule(plan);
                    setShowScheduleModal(true);
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
                onSuccess={() => {
                    fetchDashboardData();
                }}
            />

            <WorkflowBedModal
                open={bedModal.open}
                actionType={bedModal.actionType}
                patientId={bedModal.patientId}
                surgeryId={bedModal.surgeryId}
                onClose={() => setBedModal({ open: false, actionType: null, patientId: null, surgeryId: null })}
                onSuccess={() => fetchDashboardData()}
            />
        </div>
    );
};

export default OTDashboard;
