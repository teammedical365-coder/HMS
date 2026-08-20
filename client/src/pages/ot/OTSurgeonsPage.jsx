import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiCalendar, FiClock, FiActivity, FiArrowRight } from 'react-icons/fi';
import { doctorAPI, otAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';

const OTSurgeonsPage = () => {
    const navigate = useNavigate();
    const [doctors, setDoctors] = useState([]);
    const [surgeries, setSurgeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSurgeonsData = useCallback(async () => {
        setLoading(true);
        try {
            const [docsRes, schedRes] = await Promise.all([
                doctorAPI.getDoctors().catch(() => ({ doctors: [] })),
                otAPI.getScheduledSurgeries().catch(() => ({ surgeries: [] }))
            ]);

            if (docsRes.doctors) setDoctors(docsRes.doctors || []);
            if (schedRes.surgeries) setSurgeries(schedRes.surgeries || []);

            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch surgeons error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSurgeonsData();

        const handleUpdate = () => fetchSurgeonsData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchSurgeonsData]);

    const todayStr = new Date().toISOString().split('T')[0];

    // Compute surgeon stats
    const surgeonCards = doctors.map(doc => {
        const docId = doc._id ? doc._id.toString() : '';
        const docName = (doc.name || `${doc.firstName || ''} ${doc.lastName || ''}`).replace(/^Dr\.?\s*/i, '');

        // Find today's surgeries where this doctor is surgeon or assistant
        const todayCases = surgeries.filter(s => {
            const sDate = s.surgeryDate ? new Date(s.surgeryDate).toISOString().split('T')[0] : '';
            if (sDate !== todayStr) return false;
            const primaryId = s.surgeonId ? (typeof s.surgeonId === 'object' ? s.surgeonId._id?.toString() : s.surgeonId.toString()) : '';
            const isPrimary = primaryId === docId;
            const isAssistant = Array.isArray(s.assistantSurgeonIds) && s.assistantSurgeonIds.some(as => {
                const asId = typeof as === 'object' ? as._id?.toString() : as.toString();
                return asId === docId;
            });
            return isPrimary || isAssistant;
        });

        // Find upcoming future surgeries
        const upcomingCases = surgeries.filter(s => {
            const sDate = s.surgeryDate ? new Date(s.surgeryDate).toISOString().split('T')[0] : '';
            if (!sDate || sDate <= todayStr) return false;
            const primaryId = s.surgeonId ? (typeof s.surgeonId === 'object' ? s.surgeonId._id?.toString() : s.surgeonId.toString()) : '';
            const isPrimary = primaryId === docId;
            const isAssistant = Array.isArray(s.assistantSurgeonIds) && s.assistantSurgeonIds.some(as => {
                const asId = typeof as === 'object' ? as._id?.toString() : as.toString();
                return asId === docId;
            });
            return isPrimary || isAssistant;
        });

        return {
            ...doc,
            cleanName: docName,
            todayCount: todayCases.length,
            upcomingCount: upcomingCases.length,
            todayCases
        };
    });

    const filteredSurgeons = surgeonCards.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const name = (s.cleanName || '').toLowerCase();
        const spec = (s.specialization || '').toLowerCase();
        const dept = (s.department || '').toLowerCase();
        return name.includes(q) || spec.includes(q) || dept.includes(q);
    });

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="OT Surgeons & Surgical Roster"
                subtitle="Active operating surgeons, surgical assistants, caseload distribution, and individual daily schedules."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchSurgeonsData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            {/* Surgeon Grid */}
            {filteredSurgeons.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiUser style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Surgeons Found</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        No doctors matching your query are currently registered.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
                    {filteredSurgeons.map(surgeon => (
                        <div
                            key={surgeon._id}
                            style={{
                                background: '#fff',
                                borderRadius: '14px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 2px 5px rgba(0,0,0,0.03)',
                                padding: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between'
                            }}
                        >
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#eff6ff', border: '1.5px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                        👨‍⚕️
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                                            Dr. {surgeon.cleanName}
                                        </h3>
                                        <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 700 }}>
                                            {surgeon.specialization || surgeon.department || 'General Surgery'}
                                        </span>
                                    </div>
                                </div>

                                {/* Caseload Statistics */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Today's Surgeries</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: surgeon.todayCount > 0 ? '#2563eb' : '#64748b' }}>
                                            {surgeon.todayCount}
                                        </div>
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Upcoming</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: surgeon.upcomingCount > 0 ? '#7c3aed' : '#64748b' }}>
                                            {surgeon.upcomingCount}
                                        </div>
                                    </div>
                                </div>

                                {/* Today's Cases Preview */}
                                {surgeon.todayCases.length > 0 && (
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            Today's Case List:
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {surgeon.todayCases.map((c, idx) => (
                                                <div key={idx} style={{ fontSize: '0.8rem', color: '#334155', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                                                    • <strong>{c.surgery}</strong> at {c.startTime || '--:--'} ({c.otRoomId?.name || 'OT'})
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Action: View Schedule */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                                <button
                                    onClick={() => navigate('/ot/schedule')}
                                    style={{ padding: '8px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    View Full OT Schedule <FiArrowRight />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default OTSurgeonsPage;
