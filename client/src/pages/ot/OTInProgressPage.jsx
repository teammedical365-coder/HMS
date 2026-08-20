import React, { useState, useEffect, useCallback } from 'react';
import { FiActivity, FiClock, FiCheckCircle, FiEye, FiCheck } from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { getStatusStyle, getElapsedTime, SurgeryDetailsModal } from './OTModals';

const OTInProgressPage = () => {
    const [inOtSurgeries, setInOtSurgeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    const fetchInOtData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await otAPI.getTodaySchedule(today);
            if (res.success) {
                const list = (res.schedule || []).filter(s => s.status === 'IN_OT');
                setInOtSurgeries(list);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch in-ot error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInOtData();

        // 1-minute timer to keep elapsed time live
        const timer = setInterval(() => {
            setInOtSurgeries(prev => [...prev]);
        }, 60000);

        const handleUpdate = () => fetchInOtData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            clearInterval(timer);
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchInOtData]);

    const handleCompleteSurgery = async (surgeryId) => {
        if (!window.confirm('Mark this surgery as completed and transfer to Post-Op recovery?')) return;
        try {
            const res = await otAPI.updateSurgeryWorkflow(surgeryId, { status: 'SURGERY_COMPLETED' });
            if (res.success) fetchInOtData();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to complete surgery');
        }
    };

    const filteredSurgeries = inOtSurgeries.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const pName = (s.patientId?.name || '').toLowerCase();
        const pMrn = (s.patientId?.mrn || s.patientId?.patientId || '').toLowerCase();
        const proc = (s.surgery || '').toLowerCase();
        const sName = (s.surgeonId?.name || '').toLowerCase();
        const rName = (s.otRoomId?.name || '').toLowerCase();
        return pName.includes(q) || pMrn.includes(q) || proc.includes(q) || sName.includes(q) || rName.includes(q);
    });

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="Surgeries In OT (Active Live Feed)"
                subtitle="Live intraoperative status, elapsed surgery duration, and active surgical team monitoring."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchInOtData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ inOt: inOtSurgeries.length }}
            />

            {/* In-OT Surgeries List */}
            {filteredSurgeries.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiActivity style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Surgeries are Currently In OT</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        All OT suites are currently idle or preparing for upcoming scheduled procedures.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '18px' }}>
                    {filteredSurgeries.map(s => {
                        const elapsed = getElapsedTime(s.actualStartTime);
                        const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                        const assistants = s.assistantSurgeonIds || [];

                        return (
                            <div
                                key={s._id}
                                style={{
                                    background: '#fff5f5',
                                    borderRadius: '14px',
                                    border: '2px solid #f87171',
                                    boxShadow: '0 8px 20px -4px rgba(239,68,68,0.15)',
                                    padding: '22px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative'
                                }}
                            >
                                <div>
                                    {/* Top Line: Room + Pulsing IN OT Badge */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>🚪</span>
                                            <span style={{ fontWeight: 800, color: '#991b1b', fontSize: '1.05rem' }}>
                                                {s.otRoomId?.name || 'Major OT Suite'}
                                            </span>
                                        </div>

                                        <span style={{
                                            padding: '5px 14px',
                                            borderRadius: '16px',
                                            fontSize: '0.8rem',
                                            fontWeight: 800,
                                            background: '#fee2e2',
                                            color: '#b91c1c',
                                            border: '1px solid #fca5a5',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
                                            🔴 IN OT (ACTIVE)
                                        </span>
                                    </div>

                                    {/* Procedure Name */}
                                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', marginBottom: '8px' }}>
                                        {s.surgery}
                                    </div>

                                    {/* Elapsed Time Banner */}
                                    <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
                                                ELAPSED DURATION
                                            </div>
                                            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#b91c1c' }}>
                                                {elapsed || 'In Progress'}
                                            </div>
                                        </div>
                                        {s.actualStartTime && (
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'right' }}>
                                                Started at: <strong>{new Date(s.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                                            </div>
                                        )}
                                    </div>

                                    {/* Patient Info */}
                                    <div style={{ background: '#ffffff', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
                                            👤 {s.patientId?.name || 'Patient'}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                            MRN: <strong>{s.patientId?.mrn || s.patientId?.patientId || '-'}</strong>
                                        </div>
                                    </div>

                                    {/* Surgeon & Team */}
                                    <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '12px' }}>
                                        <div>👨‍⚕️ Operating Surgeon: <strong>Dr. {surgeonName}</strong></div>
                                        {assistants.length > 0 && (
                                            <div style={{ color: '#475569', marginTop: '2px' }}>
                                                Assistants: {assistants.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom Actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '16px', borderTop: '1px solid #fee2e2' }}>
                                    <button
                                        onClick={() => {
                                            setSelectedSurgery(s);
                                            setShowDetailsModal(true);
                                        }}
                                        style={{ padding: '8px 16px', background: '#ffffff', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, color: '#991b1b', cursor: 'pointer' }}
                                    >
                                        View Details
                                    </button>

                                    <button
                                        onClick={() => handleCompleteSurgery(s._id)}
                                        style={{ padding: '8px 20px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <FiCheck /> ✓ Complete Surgery
                                    </button>
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

export default OTInProgressPage;
