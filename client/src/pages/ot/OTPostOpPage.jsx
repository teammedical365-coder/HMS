import React, { useState, useEffect, useCallback } from 'react';
import { FiHeart, FiClock, FiCheckCircle, FiEye, FiArrowRight } from 'react-icons/fi';
import { otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { getStatusStyle, SurgeryDetailsModal, WorkflowBedModal } from './OTModals';

const OTPostOpPage = () => {
    const [postOpSurgeries, setPostOpSurgeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [bedModal, setBedModal] = useState({ open: false, actionType: null, patientId: null, surgeryId: null });

    const fetchPostOpData = useCallback(async () => {
        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const res = await otAPI.getTodaySchedule(today);
            if (res.success) {
                const list = (res.schedule || []).filter(s => s.status === 'POST_OP' || s.status === 'SURGERY_COMPLETED');
                setPostOpSurgeries(list);
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch post-op error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPostOpData();

        const handleUpdate = () => fetchPostOpData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchPostOpData]);

    const handleWorkflowTransition = async (surgeryId, nextStatus) => {
        try {
            const res = await otAPI.updateSurgeryWorkflow(surgeryId, { status: nextStatus });
            if (res.success) fetchPostOpData();
        } catch (err) {
            alert(err.response?.data?.message || 'Workflow transition failed');
        }
    };

    const filteredSurgeries = postOpSurgeries.filter(s => {
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
                title="Post-Operative Patients & Recovery"
                subtitle="Patients in PACU / recovery unit, vitals monitoring, recovery stabilization, and ward bed transfer."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchPostOpData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ postOp: postOpSurgeries.length }}
            />

            {/* Post-Op Patients List */}
            {filteredSurgeries.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiHeart style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Patients Currently in Post-Op Recovery</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        When surgeries complete, patients transition to PACU/Post-Op recovery and appear here.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                    {filteredSurgeries.map(s => {
                        const stInfo = getStatusStyle(s.status);
                        const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');

                        return (
                            <div
                                key={s._id}
                                style={{
                                    background: '#fff',
                                    borderRadius: '14px',
                                    border: '1.5px solid #a5f3fc',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                                    padding: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between'
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, background: '#ecfeff', color: '#0e7490', padding: '3px 8px', borderRadius: '6px' }}>
                                            🏥 PACU / Recovery Unit
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
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>SURGEON</span>
                                            <strong style={{ color: '#0f172a' }}>Dr. {surgeonName}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>OT ROOM</span>
                                            <strong style={{ color: '#0f172a' }}>{s.otRoomId?.name || 'OT Suite'}</strong>
                                        </div>
                                    </div>

                                    {s.actualEndTime && (
                                        <div style={{ fontSize: '0.8rem', color: '#0e7490', background: '#ecfeff', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                                            ⏱️ Completed at: <strong>{new Date(s.actualEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                                        </div>
                                    )}
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

                                    {s.status === 'SURGERY_COMPLETED' ? (
                                        <button
                                            onClick={() => handleWorkflowTransition(s._id, 'POST_OP')}
                                            style={{ padding: '7px 16px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Move to Post-Op →
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                onClick={() => setBedModal({ open: true, actionType: 'TRANSFER', patientId: s.patientId?._id, surgeryId: s._id })}
                                                style={{ padding: '7px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Transfer Bed
                                            </button>
                                            <button
                                                onClick={() => handleWorkflowTransition(s._id, 'COMPLETED')}
                                                style={{ padding: '7px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                ✓ Discharge / Finish
                                            </button>
                                        </div>
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

            <WorkflowBedModal
                open={bedModal.open}
                actionType={bedModal.actionType}
                patientId={bedModal.patientId}
                surgeryId={bedModal.surgeryId}
                onClose={() => setBedModal({ open: false, actionType: null, patientId: null, surgeryId: null })}
                onSuccess={() => fetchPostOpData()}
            />
        </div>
    );
};

export default OTPostOpPage;
