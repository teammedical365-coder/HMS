import React, { useState, useEffect, useCallback } from 'react';
import { FiFileText, FiCalendar, FiClock, FiActivity, FiPieChart, FiTrendingUp, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';

const OTReportsPage = () => {
    const [allSurgeries, setAllSurgeries] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filters
    const [dateRange, setDateRange] = useState('THIS_MONTH'); // TODAY, THIS_WEEK, THIS_MONTH, ALL, CUSTOM
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    const fetchReportsData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const [schedRes, roomsRes] = await Promise.all([
                otAPI.getScheduledSurgeries().catch(() => ({ surgeries: [] })),
                otAPI.getRooms().catch(() => ({ rooms: [] }))
            ]);

            if (schedRes.surgeries) setAllSurgeries(schedRes.surgeries || []);
            if (roomsRes.rooms) setRooms(roomsRes.rooms || []);

            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch reports error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReportsData();

        const handleUpdate = () => fetchReportsData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchReportsData]);

    // Date range filtering
    const filteredSurgeries = allSurgeries.filter(s => {
        const sDate = s.surgeryDate ? new Date(s.surgeryDate) : new Date(s.createdAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateRange === 'TODAY') {
            const sDay = new Date(sDate);
            sDay.setHours(0, 0, 0, 0);
            return sDay.getTime() === today.getTime();
        }

        if (dateRange === 'THIS_WEEK') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return sDate >= weekAgo;
        }

        if (dateRange === 'THIS_MONTH') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return sDate >= monthAgo;
        }

        if (dateRange === 'CUSTOM' && customFrom && customTo) {
            const from = new Date(customFrom);
            const to = new Date(customTo);
            to.setHours(23, 59, 59, 999);
            return sDate >= from && sDate <= to;
        }

        return true;
    });

    // Compute Metrics
    const totalCount = filteredSurgeries.length;
    const completedCount = filteredSurgeries.filter(s => s.status === 'COMPLETED' || s.status === 'SURGERY_COMPLETED').length;
    const cancelledCount = filteredSurgeries.filter(s => s.status === 'CANCELLED').length;
    const inProgressCount = filteredSurgeries.filter(s => s.status === 'IN_OT').length;
    const scheduledCount = filteredSurgeries.filter(s => s.status === 'SCHEDULED' || s.status === 'PRE_OP' || s.status === 'READY_FOR_OT').length;

    // Calculate procedure breakdown
    const procedureMap = {};
    filteredSurgeries.forEach(s => {
        const proc = s.surgery || 'Other Procedure';
        procedureMap[proc] = (procedureMap[proc] || 0) + 1;
    });
    const procedureList = Object.entries(procedureMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // Calculate surgeon breakdown
    const surgeonMap = {};
    filteredSurgeries.forEach(s => {
        const sName = (s.surgeonId?.name || s.doctorId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
        surgeonMap[sName] = (surgeonMap[sName] || 0) + 1;
    });
    const surgeonList = Object.entries(surgeonMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // Calculate room breakdown
    const roomMap = {};
    filteredSurgeries.forEach(s => {
        const rName = s.otRoomId?.name || 'Unassigned Room';
        roomMap[rName] = (roomMap[rName] || 0) + 1;
    });
    const roomList = Object.entries(roomMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="OT Reports & Operational Analytics"
                subtitle="Departmental throughput, room utilization, surgical volume, and performance indicators."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchReportsData}
            />

            {/* Date Range Selector */}
            <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                        { id: 'TODAY', label: 'Today' },
                        { id: 'THIS_WEEK', label: 'This Week' },
                        { id: 'THIS_MONTH', label: 'This Month (Last 30 Days)' },
                        { id: 'ALL', label: 'All Time' },
                        { id: 'CUSTOM', label: 'Custom Range' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setDateRange(f.id)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: 'none',
                                background: dateRange === f.id ? '#0f172a' : '#f1f5f9',
                                color: dateRange === f.id ? '#ffffff' : '#475569',
                                transition: 'all 0.2s'
                            }}
                        >
                            {f.label}
                        </button>
                    ))}

                    {dateRange === 'CUSTOM' && (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '8px' }}>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={e => setCustomFrom(e.target.value)}
                                style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                            />
                            <span>to</span>
                            <input
                                type="date"
                                value={customTo}
                                onChange={e => setCustomTo(e.target.value)}
                                style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                            />
                        </div>
                    )}
                </div>

                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                    Period Total: <strong>{totalCount}</strong> procedures recorded
                </div>
            </div>

            {/* KPI Metric Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Surgeries</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', margin: '4px 0' }}>{totalCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Scheduled or completed in selected range</div>
                </div>

                <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '14px', border: '1px solid #bbf7d0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Completed Surgeries</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#15803d', margin: '4px 0' }}>{completedCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600 }}>Completion Rate: {completionRate}%</div>
                </div>

                <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '14px', border: '1px solid #bfdbfe', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>Scheduled / Pending</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#1d4ed8', margin: '4px 0' }}>{scheduledCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#1e40af' }}>Upcoming OT queue</div>
                </div>

                <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '14px', border: '1px solid #fecaca', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Cancelled Surgeries</div>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#b91c1c', margin: '4px 0' }}>{cancelledCount}</div>
                    <div style={{ fontSize: '0.8rem', color: '#991b1b' }}>Cancelled or rescheduled plans</div>
                </div>
            </div>

            {/* Analytics Breakdown Grid (3 Columns) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                {/* 1. Surgeries by Procedure */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        📋 Surgeries by Procedure
                    </h3>

                    {procedureList.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No procedure data recorded.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {procedureList.map((item, idx) => {
                                const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
                                return (
                                    <div key={idx}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                                            <span>{item.name}</span>
                                            <span>{item.count} ({pct}%)</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: '#3b82f6', borderRadius: '4px' }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 2. Surgeries by Surgeon */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        👨‍⚕️ Surgeries by Surgeon
                    </h3>

                    {surgeonList.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No surgeon data recorded.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {surgeonList.map((item, idx) => {
                                const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
                                return (
                                    <div key={idx}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                                            <span>Dr. {item.name}</span>
                                            <span>{item.count} ({pct}%)</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: '#8b5cf6', borderRadius: '4px' }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 3. Surgeries by OT Room */}
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🚪 Surgeries by OT Room
                    </h3>

                    {roomList.length === 0 ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>No room allocation data recorded.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {roomList.map((item, idx) => {
                                const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
                                return (
                                    <div key={idx}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                                            <span>{item.name}</span>
                                            <span>{item.count} ({pct}%)</span>
                                        </div>
                                        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: '#10b981', borderRadius: '4px' }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default OTReportsPage;
