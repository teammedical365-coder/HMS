import React, { useState, useEffect, useCallback } from 'react';
import { FiClock, FiCalendar, FiSearch, FiFilter, FiEye, FiCheck, FiX, FiPlus, FiAlertCircle } from 'react-icons/fi';
import { otAPI, doctorAPI } from '../../utils/api';
import socket from '../../utils/socket';
import OTHeader from './OTHeader';
import { 
    getStatusStyle, 
    SurgeryDetailsModal, 
    ScheduleSurgeryModal 
} from './OTModals';

const OTPlannedSurgeries = () => {
    const [plannedSurgeries, setPlannedSurgeries] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [otRoomsList, setOtRoomsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('ALL'); // ALL, ADMISSION_REQ, NO_ADMISSION, TODAY, UPCOMING

    // Modals
    const [selectedSurgery, setSelectedSurgery] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [activePlanToSchedule, setActivePlanToSchedule] = useState(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);

    const fetchPlannedData = useCallback(async () => {
        setLoading(true);
        try {
            const [plannedRes, docsRes, roomsRes] = await Promise.all([
                otAPI.getPlannedSurgeries(),
                doctorAPI.getDoctors().catch(() => ({ doctors: [] })),
                otAPI.getRooms().catch(() => ({ rooms: [] }))
            ]);

            if (plannedRes.success) {
                setPlannedSurgeries(plannedRes.surgeries || []);
            }
            if (docsRes.doctors) setDoctorsList(docsRes.doctors);
            if (roomsRes.rooms) setOtRoomsList(roomsRes.rooms);

            setLastUpdated(new Date());
        } catch (err) {
            console.error('Fetch planned error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPlannedData();

        const handleUpdate = () => fetchPlannedData();
        socket.on('ot_update', handleUpdate);
        socket.on('ot_surgery_scheduled', handleUpdate);

        return () => {
            socket.off('ot_update', handleUpdate);
            socket.off('ot_surgery_scheduled', handleUpdate);
        };
    }, [fetchPlannedData]);

    const handleCancelPlan = async (planId) => {
        if (!window.confirm('Are you sure you want to cancel this surgery plan?')) return;
        try {
            const res = await otAPI.cancelSurgery(planId);
            if (res.success) {
                fetchPlannedData();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to cancel surgery plan');
        }
    };

    // Filter logic
    const filteredSurgeries = plannedSurgeries.filter(plan => {
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const pName = (plan.patientId?.name || '').toLowerCase();
            const pMrn = (plan.patientId?.mrn || plan.patientId?.patientId || '').toLowerCase();
            const proc = (plan.surgery || '').toLowerCase();
            const sName = (plan.surgeonId?.name || plan.doctorId?.name || '').toLowerCase();
            const planId = (plan.planId || '').toLowerCase();
            if (!pName.includes(q) && !pMrn.includes(q) && !proc.includes(q) && !sName.includes(q) && !planId.includes(q)) {
                return false;
            }
        }

        // Tab filter
        const todayStr = new Date().toISOString().split('T')[0];
        const prefDate = plan.preferredDate ? new Date(plan.preferredDate).toISOString().split('T')[0] : null;

        if (activeFilter === 'ADMISSION_REQ') return Boolean(plan.admissionRequired);
        if (activeFilter === 'NO_ADMISSION') return !plan.admissionRequired;
        if (activeFilter === 'TODAY') return prefDate === todayStr;
        if (activeFilter === 'UPCOMING') return prefDate && prefDate > todayStr;

        return true;
    });

    return (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px', fontFamily: "'Inter', sans-serif" }}>
            <OTHeader
                title="Planned Surgeries (Awaiting OT Scheduling)"
                subtitle="Review consultation surgery plans created by doctors and schedule OT suites, surgeons, and timeslots."
                lastUpdated={lastUpdated}
                loading={loading}
                onRefresh={fetchPlannedData}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                badgeCounts={{ planned: plannedSurgeries.length }}
            />

            {/* Filter Bar */}
            <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                        { id: 'ALL', label: `All Plans (${plannedSurgeries.length})` },
                        { id: 'ADMISSION_REQ', label: `Admission Required (${plannedSurgeries.filter(p => p.admissionRequired).length})` },
                        { id: 'NO_ADMISSION', label: `Day Care / No Admission (${plannedSurgeries.filter(p => !p.admissionRequired).length})` },
                        { id: 'TODAY', label: 'Preferred Today' },
                        { id: 'UPCOMING', label: 'Upcoming Preferred' }
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
                                background: activeFilter === f.id ? '#7c3aed' : '#f1f5f9',
                                color: activeFilter === f.id ? '#ffffff' : '#475569',
                                transition: 'all 0.2s'
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                    Showing <strong>{filteredSurgeries.length}</strong> planned procedures
                </div>
            </div>

            {/* Planned Surgeries Cards/Table */}
            {filteredSurgeries.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                    <FiClock style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '12px' }} />
                    <h3 style={{ margin: '0 0 6px', color: '#1e293b', fontSize: '1.2rem' }}>No Planned Surgeries Found</h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
                        {searchQuery ? 'No planned surgeries matched your search query.' : 'There are currently no doctor-created surgery plans waiting for OT scheduling.'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                    {filteredSurgeries.map(plan => {
                        const surgeonName = (plan.surgeonId?.name || plan.doctorId?.name || 'Doctor').replace(/^Dr\.?\s*/i, '');
                        const referringDoctor = plan.referringDoctorId?.name ? (plan.referringDoctorId?.name).replace(/^Dr\.?\s*/i, '') : null;
                        const assistants = plan.assistantSurgeonIds || [];

                        return (
                            <div 
                                key={plan._id}
                                style={{ 
                                    background: '#ffffff', 
                                    borderRadius: '14px', 
                                    border: '1px solid #e2e8f0', 
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.03)', 
                                    padding: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    position: 'relative'
                                }}
                            >
                                <div>
                                    {/* Top Line: Plan ID + Admission Badge */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 800, background: '#f5f3ff', color: '#6b21a8', border: '1px solid #ddd6fe', padding: '3px 8px', borderRadius: '6px' }}>
                                                {plan.planId || 'PLAN'}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                                                Created: {new Date(plan.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                            </span>
                                        </div>

                                        <span style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 800,
                                            padding: '3px 10px',
                                            borderRadius: '12px',
                                            background: plan.admissionRequired ? '#eff6ff' : '#f8fafc',
                                            color: plan.admissionRequired ? '#1d4ed8' : '#64748b',
                                            border: `1px solid ${plan.admissionRequired ? '#bfdbfe' : '#e2e8f0'}`
                                        }}>
                                            {plan.admissionRequired ? '🏥 Admission Required' : 'Day Care'}
                                        </span>
                                    </div>

                                    {/* Procedure Title */}
                                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                                        {plan.surgery}
                                    </div>

                                    {/* Patient Info */}
                                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>
                                            👤 {plan.patientId?.name || 'Patient'}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                            MRN: <strong>{plan.patientId?.mrn || plan.patientId?.patientId || '-'}</strong>
                                            {plan.patientId?.phone && <span> • 📞 {plan.patientId.phone}</span>}
                                        </div>
                                    </div>

                                    {/* Clinical Info Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.82rem', color: '#475569', marginBottom: '12px' }}>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>OPERATING SURGEON</span>
                                            <strong style={{ color: '#0f172a' }}>Dr. {surgeonName}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>PREFERRED DATE</span>
                                            <strong style={{ color: '#0f172a' }}>
                                                {plan.preferredDate ? new Date(plan.preferredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Flexible'}
                                            </strong>
                                        </div>
                                        {referringDoctor && referringDoctor !== surgeonName && (
                                            <div>
                                                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>REFERRING DOCTOR</span>
                                                <span>Dr. {referringDoctor}</span>
                                            </div>
                                        )}
                                        {plan.diagnosis && (
                                            <div>
                                                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>DIAGNOSIS</span>
                                                <span>{plan.diagnosis}</span>
                                            </div>
                                        )}
                                    </div>

                                    {assistants.length > 0 && (
                                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '10px' }}>
                                            <span style={{ color: '#64748b' }}>Assistants: </span>
                                            {assistants.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                        </div>
                                    )}

                                    {plan.notes && (
                                        <div style={{ fontSize: '0.8rem', color: '#64748b', background: '#fcfcfc', border: '1px dashed #cbd5e1', padding: '6px 10px', borderRadius: '6px', marginBottom: '12px' }}>
                                            "{plan.notes}"
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                                    <button
                                        onClick={() => handleCancelPlan(plan._id)}
                                        style={{ padding: '8px 12px', background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Cancel Plan
                                    </button>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => {
                                                setSelectedSurgery(plan);
                                                setShowDetailsModal(true);
                                            }}
                                            style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            View Plan
                                        </button>
                                        <button
                                            onClick={() => {
                                                setActivePlanToSchedule(plan);
                                                setShowScheduleModal(true);
                                            }}
                                            style={{ padding: '8px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            <FiCalendar /> Schedule OT
                                        </button>
                                    </div>
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
                    fetchPlannedData();
                }}
            />
        </div>
    );
};

export default OTPlannedSurgeries;
