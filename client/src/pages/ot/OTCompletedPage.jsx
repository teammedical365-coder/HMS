import React, { useState, useEffect, useCallback } from 'react';
import { FiCheckCircle, FiCalendar, FiClock, FiEye, FiFilter, FiDownload } from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { getStatusStyle, SurgeryDetailsModal } from './OTModals';

const OTCompletedPage = () => {
    const [completedSurgeries, setCompletedSurgeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('TODAY'); // TODAY, YESTERDAY, THIS_WEEK, THIS_MONTH, ALL
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    const fetchCompletedData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch scheduled endpoint which returns all surgery records
            const res = await otAPI.getScheduledSurgeries();
            if (res.success) {
                const list = (res.surgeries || []).filter(s => s.status === 'COMPLETED' || s.status === 'SURGERY_COMPLETED');
                setCompletedSurgeries(list);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch completed error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCompletedData();

        const handleUpdate = () => fetchCompletedData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchCompletedData]);

    const filteredSurgeries = completedSurgeries.filter(s => {
        // Search
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

        // Date Filter
        const sDate = s.surgeryDate ? new Date(s.surgeryDate) : new Date(s.updatedAt || s.createdAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'TODAY') {
            const sDay = new Date(sDate);
            sDay.setHours(0, 0, 0, 0);
            return sDay.getTime() === today.getTime();
        }

        if (dateFilter === 'YESTERDAY') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const sDay = new Date(sDate);
            sDay.setHours(0, 0, 0, 0);
            return sDay.getTime() === yesterday.getTime();
        }

        if (dateFilter === 'THIS_WEEK') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return sDate >= weekAgo;
        }

        if (dateFilter === 'THIS_MONTH') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return sDate >= monthAgo;
        }

        if (dateFilter === 'CUSTOM' && customFrom && customTo) {
            const from = new Date(customFrom);
            const to = new Date(customTo);
            to.setHours(23, 59, 59, 999);
            return sDate >= from && sDate <= to;
        }

        return true;
    });

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="Completed Surgeries & Historical Archive"
                subtitle="Historical surgical logbook, procedure outcomes, completion timestamps, and operational audit trail."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchCompletedData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ completed: completedSurgeries.length }}
            />

            {/* Filter Bar */}
            <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                        { id: 'ALL', label: `All Time (${completedSurgeries.length})` },
                        { id: 'TODAY', label: 'Today' },
                        { id: 'YESTERDAY', label: 'Yesterday' },
                        { id: 'THIS_WEEK', label: 'This Week' },
                        { id: 'THIS_MONTH', label: 'This Month' },
                        { id: 'CUSTOM', label: 'Custom Range' }
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setDateFilter(f.id)}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: 'none',
                                background: dateFilter === f.id ? '#16a34a' : '#f1f5f9',
                                color: dateFilter === f.id ? '#ffffff' : '#475569'
                            }}
                        >
                            {f.label}
                        </button>
                    ))}

                    {dateFilter === 'CUSTOM' && (
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
                    Showing <strong>{filteredSurgeries.length}</strong> completed surgeries
                </div>
            </div>

            {/* Completed Surgeries Table */}
            {filteredSurgeries.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiCheckCircle style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Completed Surgeries Found</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        Surgeries finished and discharged from OT recovery will appear in this historical archive.
                    </p>
                </div>
            ) : (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    <th style={{ padding: '14px 18px' }}>Date</th>
                                    <th style={{ padding: '14px 18px' }}>Patient & MRN</th>
                                    <th style={{ padding: '14px 18px' }}>Procedure</th>
                                    <th style={{ padding: '14px 18px' }}>Surgical Team</th>
                                    <th style={{ padding: '14px 18px' }}>OT Suite</th>
                                    <th style={{ padding: '14px 18px' }}>Billing Status</th>
                                    <th style={{ padding: '14px 18px' }}>Outcome</th>
                                    <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSurgeries.map((s, idx) => {
                                    const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                                    const assistants = s.assistantSurgeonIds || [];
                                    const cost = Number(s.surgeryCost) || 0;

                                    return (
                                        <tr key={s._id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                                            <td style={{ padding: '14px 18px', color: '#334155', fontWeight: 600 }}>
                                                {new Date(s.surgeryDate || s.updatedAt || s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td style={{ padding: '14px 18px' }}>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.patientId?.name || 'Patient'}</div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>MRN: {s.patientId?.mrn || s.patientId?.patientId || '-'}</div>
                                            </td>
                                            <td style={{ padding: '14px 18px', fontWeight: 700, color: '#0f172a' }}>
                                                {s.surgery}
                                            </td>
                                            <td style={{ padding: '14px 18px' }}>
                                                <div style={{ color: '#0f172a', fontWeight: 600 }}>Dr. {surgeonName}</div>
                                                {assistants.length > 0 && (
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                        Ast: {assistants.map(a => `Dr. ${(a.name || 'Doc').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 18px', color: '#475569', fontWeight: 600 }}>
                                                🚪 {s.otRoomId?.name || 'OT Suite'}
                                            </td>
                                            <td style={{ padding: '14px 18px' }}>
                                                <span style={{
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
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                                        ₹{cost.toLocaleString('en-IN')}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 18px' }}>
                                                <span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 800, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>
                                                    ✓ COMPLETED
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => {
                                                        setSelectedSurgery(s);
                                                        setShowDetailsModal(true);
                                                    }}
                                                    style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                                >
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
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

export default OTCompletedPage;
