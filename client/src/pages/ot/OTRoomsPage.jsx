import React, { useState, useEffect, useCallback } from 'react';
import { FiBox, FiClock, FiActivity, FiCheckCircle, FiAlertTriangle, FiEye, FiCalendar } from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { SurgeryDetailsModal } from './OTModals';

const OTRoomsPage = () => {
    const [rooms, setRooms] = useState([]);
    const [summary, setSummary] = useState({ available: 0, inOt: 0, delayed: 0, scheduled: 0, total: 0 });
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('ALL'); // ALL, AVAILABLE, SCHEDULED, IN_OT, DELAYED, MAINTENANCE

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    const fetchRoomsData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await otAPI.getRoomStatus(today);
            if (res.success) {
                setRooms(res.rooms || []);
                if (res.summary) setSummary(res.summary);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch rooms error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoomsData();

        const handleUpdate = () => fetchRoomsData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchRoomsData]);

    const filteredRooms = rooms.filter(r => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const rName = (r.name || '').toLowerCase();
            const proc = (r.currentSurgery?.procedure || r.nextSurgery?.procedure || '').toLowerCase();
            const sName = (r.currentSurgery?.surgeon || '').toLowerCase();
            const pName = (r.currentSurgery?.patientName || '').toLowerCase();
            if (!rName.includes(q) && !proc.includes(q) && !sName.includes(q) && !pName.includes(q)) {
                return false;
            }
        }

        const st = (r.status || '').toUpperCase();
        if (activeFilter === 'AVAILABLE') return st === 'AVAILABLE';
        if (activeFilter === 'SCHEDULED') return st === 'SCHEDULED';
        if (activeFilter === 'IN_OT') return st === 'IN OT' || st === 'IN_OT';
        if (activeFilter === 'DELAYED') return st === 'DELAYED';
        if (activeFilter === 'MAINTENANCE') return st === 'MAINTENANCE' || st === 'UNAVAILABLE';

        return true;
    });

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="OT Rooms & Live Suite Board"
                subtitle="Live status, capacity, intraoperative monitoring, and real-time equipment allocation for all OT suites."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchRoomsData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ roomsInUse: summary.inOt }}
            />

            {/* Room Summary KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Rooms</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>{rooms.length}</div>
                    </div>
                    <FiBox style={{ fontSize: '1.8rem', color: '#64748b' }} />
                </div>

                <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Available Now</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d' }}>{summary.available}</div>
                    </div>
                    <FiCheckCircle style={{ fontSize: '1.8rem', color: '#16a34a' }} />
                </div>

                <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '12px', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>In OT (Active)</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#b91c1c' }}>{summary.inOt}</div>
                    </div>
                    <FiActivity style={{ fontSize: '1.8rem', color: '#ef4444' }} />
                </div>

                <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '12px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Scheduled Next</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#2563eb' }}>{summary.scheduled}</div>
                    </div>
                    <FiClock style={{ fontSize: '1.8rem', color: '#3b82f6' }} />
                </div>

                <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Delayed</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#b45309' }}>{summary.delayed}</div>
                    </div>
                    <FiAlertTriangle style={{ fontSize: '1.8rem', color: '#f59e0b' }} />
                </div>
            </div>

            {/* Filter Tabs */}
            <div style={{ background: '#fff', padding: '14px 18px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                    { id: 'ALL', label: `All Rooms (${rooms.length})` },
                    { id: 'AVAILABLE', label: `Available (${summary.available})` },
                    { id: 'IN_OT', label: `In OT (${summary.inOt})` },
                    { id: 'SCHEDULED', label: `Scheduled (${summary.scheduled})` },
                    { id: 'DELAYED', label: `Delayed (${summary.delayed})` },
                    { id: 'MAINTENANCE', label: 'Maintenance' }
                ].map(f => (
                    <button
                        key={f.id}
                        onClick={() => setActiveFilter(f.id)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: 'none',
                            background: activeFilter === f.id ? '#0f172a' : '#f1f5f9',
                            color: activeFilter === f.id ? '#ffffff' : '#475569',
                            transition: 'all 0.2s'
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Room Grid */}
            {filteredRooms.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiBox style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No OT Rooms Match Filter</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        Try changing your filter or search query.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '18px' }}>
                    {filteredRooms.map(room => {
                        const isOccupied = room.status === 'In OT' || room.status === 'IN_OT';
                        const isAvailable = room.status === 'Available' || room.status === 'AVAILABLE';
                        const isDelayed = room.status === 'Delayed';
                        const isScheduled = room.status === 'Scheduled';

                        return (
                            <div
                                key={room._id}
                                style={{
                                    background: isOccupied ? '#fff5f5' : (isAvailable ? '#fafffd' : '#ffffff'),
                                    borderRadius: '14px',
                                    border: `1.5px solid ${isOccupied ? '#fca5a5' : (isAvailable ? '#86efac' : (isDelayed ? '#fde68a' : '#cbd5e1'))}`,
                                    boxShadow: isOccupied ? '0 4px 12px rgba(239,68,68,0.1)' : '0 2px 5px rgba(0,0,0,0.03)',
                                    padding: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative'
                                }}
                            >
                                <div>
                                    {/* Header: Room Name + Status Badge */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.4rem' }}>🚪</span>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                                                    {room.name}
                                                </h3>
                                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                                    {room.roomType || 'General OT Suite'}
                                                </span>
                                            </div>
                                        </div>

                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '16px',
                                            fontSize: '0.78rem',
                                            fontWeight: 800,
                                            background: isOccupied ? '#fee2e2' : (isAvailable ? '#dcfce7' : (isDelayed ? '#fef3c7' : '#eff6ff')),
                                            color: isOccupied ? '#b91c1c' : (isAvailable ? '#15803d' : (isDelayed ? '#b45309' : '#1d4ed8')),
                                            border: `1px solid ${isOccupied ? '#fca5a5' : (isAvailable ? '#bbf7d0' : (isDelayed ? '#fde68a' : '#bfdbfe'))}`
                                        }}>
                                            {room.status}
                                        </span>
                                    </div>

                                    {/* Active In-OT Surgery Card */}
                                    {room.currentSurgery ? (
                                        <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' }}>
                                                    🔴 ACTIVE SURGERY IN PROGRESS
                                                </span>
                                                {room.currentSurgery.elapsedTime && (
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#b91c1c', background: '#fee2e2', padding: '2px 8px', borderRadius: '4px' }}>
                                                        ⏱️ {room.currentSurgery.elapsedTime}
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                                                {room.currentSurgery.procedure}
                                            </div>

                                            <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '4px' }}>
                                                Patient: <strong>{room.currentSurgery.patientName || 'Patient'}</strong>
                                            </div>
                                            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                                                Surgeon: <strong>Dr. {(room.currentSurgery.surgeon || 'Doctor').replace(/^Dr\.?\s*/i, '')}</strong>
                                            </div>
                                            {room.currentSurgery.startTime && (
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                                                    Scheduled: {room.currentSurgery.startTime} - {room.currentSurgery.endTime}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                                            {isAvailable ? (
                                                <div style={{ color: '#16a34a', fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <FiCheckCircle /> Available for immediate scheduling
                                                </div>
                                            ) : (
                                                <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                                    No surgery currently in OT.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Next Scheduled Surgery Preview */}
                                    {room.nextSurgery && (
                                        <div style={{ fontSize: '0.82rem', color: '#475569', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                                            <span style={{ fontWeight: 700, color: '#1d4ed8' }}>Next in Queue: </span>
                                            <span><strong>{room.nextSurgery.procedure}</strong> at {room.nextSurgery.time}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Bottom Actions */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                    {room.currentSurgery?.rawSurgery && (
                                        <button
                                            onClick={() => {
                                                setSelectedSurgery(room.currentSurgery.rawSurgery);
                                                setShowDetailsModal(true);
                                            }}
                                            style={{ padding: '7px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                        >
                                            View Active Surgery
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
        </div>
    );
};

export default OTRoomsPage;
