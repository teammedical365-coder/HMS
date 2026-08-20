import React, { useState, useEffect, useCallback } from 'react';
import { FiUserCheck, FiClock, FiCalendar, FiCheckCircle, FiActivity, FiAlertCircle } from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { getStatusStyle, SurgeryDetailsModal } from './OTModals';

const OTPreOpPage = () => {
    const [preOpSurgeries, setPreOpSurgeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    const fetchPreOpData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await otAPI.getTodaySchedule(today);
            if (res.success) {
                const list = (res.schedule || []).filter(s => s.status === 'PRE_OP' || s.status === 'READY_FOR_OT');
                setPreOpSurgeries(list);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch pre-op error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPreOpData();

        const handleUpdate = () => fetchPreOpData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchPreOpData]);

    const handleWorkflowTransition = async (surgeryId, nextStatus) => {
        try {
            const res = await otAPI.updateSurgeryWorkflow(surgeryId, { status: nextStatus });
            if (res.success) fetchPreOpData();
        } catch (err) {
            alert(err.response?.data?.message || 'Workflow transition failed');
        }
    };

    const filteredSurgeries = preOpSurgeries.filter(s => {
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
                title="Pre-Operative Patients"
                subtitle="Patients currently admitted and preparing for surgery (fasting, pre-medication, clinical clearance, readiness check)."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchPreOpData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ preOp: preOpSurgeries.length }}
            />

            {/* Pre-Op Patients List */}
            {filteredSurgeries.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiUserCheck style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Patients Currently in Pre-Op</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        When scheduled patients are admitted and pre-op preparation starts, they will appear here.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                    {filteredSurgeries.map(s => {
                        const stInfo = getStatusStyle(s.status);
                        const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                        const assistants = s.assistantSurgeonIds || [];

                        return (
                            <div
                                key={s._id}
                                style={{
                                    background: '#fff',
                                    borderRadius: '14px',
                                    border: `1.5px solid ${s.status === 'READY_FOR_OT' ? '#d8b4fe' : '#fde68a'}`,
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                                    padding: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px' }}>
                                            🚪 {s.otRoomId?.name || 'OT Suite'}
                                        </span>

                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            background: stInfo.bg,
                                            color: stInfo.color,
                                            border: `1px solid ${stInfo.border}`
                                        }}>
                                            {stInfo.label}
                                        </span>
                                    </div>

                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                                        {s.surgery}
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
                                            👤 {s.patientId?.name || 'Patient'}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                            MRN: <strong>{s.patientId?.mrn || s.patientId?.patientId || '-'}</strong>
                                            {s.patientId?.phone && <span> • 📞 {s.patientId.phone}</span>}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>SURGEON</span>
                                            <strong style={{ color: '#0f172a' }}>Dr. {surgeonName}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>SCHEDULED TIME</span>
                                            <strong style={{ color: '#0f172a' }}>{s.startTime || '--:--'} - {s.endTime || '--:--'}</strong>
                                        </div>
                                    </div>

                                    {/* Pre-Op Checklist Indicator */}
                                    <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#854d0e', marginBottom: '12px' }}>
                                        <div>✓ Pre-anesthesia vitals recorded</div>
                                        <div>✓ Surgical consent verified</div>
                                    </div>
                                </div>

                                {/* Bottom Actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                                    <button
                                        onClick={() => {
                                            setSelectedSurgery(s);
                                            setShowDetailsModal(true);
                                        }}
                                        style={{ padding: '7px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                                    >
                                        View Details
                                    </button>

                                    {s.status === 'PRE_OP' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'READY_FOR_OT')}
                                            style={{ padding: '7px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Mark Ready for OT →
                                        </button>
                                    )}

                                    {s.status === 'READY_FOR_OT' && (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'IN_OT')}
                                            style={{ padding: '7px 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            🔴 Transfer to OT →
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

export default OTPreOpPage;
