import React, { useState, useEffect } from 'react';
import { otAPI, admissionAPI, bedAPI } from '../../utils/api';
import { FiActivity, FiCalendar, FiCheckCircle, FiClock, FiUsers, FiBox } from 'react-icons/fi';

const OTDashboard = () => {
    const [stats, setStats] = useState(null);
    const [rooms, setRooms] = useState([]);
    const [scheduledSurgeries, setScheduledSurgeries] = useState([]);

    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [workflowActionType, setWorkflowActionType] = useState(null); // 'ADMIT' or 'TRANSFER'
    const [activeSurgeryId, setActiveSurgeryId] = useState(null);
    const [activePatientId, setActivePatientId] = useState(null);
    const [workflowBeds, setWorkflowBeds] = useState([]);
    const [selectedBedId, setSelectedBedId] = useState('');

    const handleWorkflowTransition = async (id, status) => {
        try {
            const res = await otAPI.updateSurgeryWorkflow(id, { status });
            if (res.success) {
                fetchDashboardData();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Error updating workflow');
        }
    };

    const handleOpenWorkflowModal = async (surgeryId, patientId, type) => {
        setActiveSurgeryId(surgeryId);
        setActivePatientId(patientId);
        setWorkflowActionType(type);
        try {
            const res = await bedAPI.getBeds({ status: 'AVAILABLE' });
            if (res.success) setWorkflowBeds(res.beds || []);
            setShowWorkflowModal(true);
        } catch (err) {
            alert('Failed to fetch available beds');
        }
    };

    const handleWorkflowModalSubmit = async (e) => {
        e.preventDefault();
        if (!selectedBedId) return alert('Please select a bed');
        try {
            if (workflowActionType === 'ADMIT') {
                const admRes = await admissionAPI.createAdmission({
                    patientId: activePatientId,
                    bedId: selectedBedId,
                    admissionDate: new Date().toISOString()
                });
                if (admRes.success) {
                    await otAPI.updateSurgeryWorkflow(activeSurgeryId, { status: 'ADMITTED' });
                }
            } else if (workflowActionType === 'TRANSFER') {
                const actAdmRes = await admissionAPI.getPatientAdmissions(activePatientId);
                const activeAdm = actAdmRes.admissions?.find(a => a.status === 'Admitted');
                if (activeAdm) {
                    const transRes = await admissionAPI.transferBed(activeAdm._id, { bedId: selectedBedId });
                    if (transRes.success) {
                        await otAPI.updateSurgeryWorkflow(activeSurgeryId, { status: 'POST_OP' });
                    }
                } else {
                    alert('No active admission found to transfer');
                }
            }
            setShowWorkflowModal(false);
            setSelectedBedId('');
            fetchDashboardData();
        } catch (err) {
            alert(err.response?.data?.message || 'Error processing request');
        }
    };

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const [statsRes, roomsRes, scheduleRes] = await Promise.all([
                otAPI.getDashboardStats(),
                otAPI.getRooms(),
                otAPI.getScheduledSurgeries(todayStr)
            ]);
            if (statsRes.success) setStats(statsRes.stats);
            if (roomsRes.success) setRooms(roomsRes.rooms);
            if (scheduleRes.success) setScheduledSurgeries(scheduleRes.scheduled || []);
        } catch (error) {
            console.error("Error fetching OT dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ padding: '20px' }}>Loading Operation Theatre...</div>;

    const summaryCards = [
        { label: "Today's Surgeries", value: stats?.todaySurgeries || 0, icon: <FiActivity />, color: '#3b82f6', bg: '#eff6ff' },
        { label: "Upcoming Surgeries", value: stats?.upcomingSurgeries || 0, icon: <FiCalendar />, color: '#8b5cf6', bg: '#f5f3ff' },
        { label: "Available OT Rooms", value: stats?.availableRooms || 0, icon: <FiCheckCircle />, color: '#10b981', bg: '#ecfdf5' },
        { label: "Occupied OT Rooms", value: stats?.occupiedRooms || 0, icon: <FiClock />, color: '#ef4444', bg: '#fef2f2' },
        { label: "Pre-Op Patients", value: stats?.preOpPatients || 0, icon: <FiUsers />, color: '#f59e0b', bg: '#fffbeb' },
        { label: "Post-Op Patients", value: stats?.postOpPatients || 0, icon: <FiUsers />, color: '#06b6d4', bg: '#ecfeff' },
    ];

    return (
        <div style={{ padding: '20px', fontFamily: 'Inter, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, color: '#1e293b' }}>🔪 Operation Theatre Dashboard</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>Manage surgeries, OT rooms, and patient workflows.</p>
                </div>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#475569', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <FiCalendar /> Scheduled Surgeries
                </button>
                <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#475569', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <FiBox /> OT Rooms
                </button>
                <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#475569', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <FiUsers /> Planned Patients
                </button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                {summaryCards.map((card, idx) => (
                    <div key={idx} style={{ background: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                            {card.icon}
                        </div>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>{card.label}</div>
                            <div style={{ color: '#1e293b', fontSize: '1.5rem', fontWeight: 700 }}>{card.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
                {/* Today's Schedule */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiActivity /> Today's OT Schedule
                        </h3>
                    </div>
                    <div style={{ padding: '20px' }}>
                        {scheduledSurgeries.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                                <div style={{ color: '#94a3b8', fontSize: '2rem', marginBottom: '12px' }}><FiCalendar /></div>
                                <p style={{ color: '#64748b', margin: 0 }}>No surgeries scheduled for today.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {scheduledSurgeries.map((surgery, idx) => (
                                    <div key={surgery._id} style={{ display: 'flex', gap: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', alignItems: 'flex-start' }}>
                                        <div style={{ width: '60px', textAlign: 'center', background: '#eff6ff', color: '#3b82f6', borderRadius: '8px', padding: '8px', fontWeight: 'bold' }}>
                                            <div style={{ fontSize: '0.85rem' }}>{surgery.startTime}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1e293b' }}>{surgery.surgery}</h4>
                                            <div style={{ display: 'flex', gap: '12px', color: '#64748b', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                                                <span>👤 {surgery.patientId?.name || `${surgery.patientId?.firstName || ''} ${surgery.patientId?.lastName || ''}`.trim() || 'Patient'}</span>
                                                <span>👨‍⚕️ Dr. {(surgery.surgeonId?.name || `${surgery.surgeonId?.firstName || ''} ${surgery.surgeonId?.lastName || ''}`.trim() || 'Surgeon').replace(/^Dr\.?\s*/i, '')}</span>
                                                <span style={{ fontWeight: 600, color: '#0f172a' }}>🚪 {surgery.otRoomId?.name}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                                            <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, background: '#e0e7ff', color: '#3730a3' }}>{surgery.status}</span>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {surgery.status === 'SCHEDULED' && (
                                                    <button onClick={() => surgery.admissionRequired ? handleOpenWorkflowModal(surgery._id, surgery.patientId?._id, 'ADMIT') : handleWorkflowTransition(surgery._id, 'PRE_OP')} style={{ padding: '4px 10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>{surgery.admissionRequired ? 'Admit Patient' : 'Start Pre-Op'}</button>
                                                )}
                                                {surgery.status === 'ADMITTED' && (
                                                    <button onClick={() => handleWorkflowTransition(surgery._id, 'PRE_OP')} style={{ padding: '4px 10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Start Pre-Op</button>
                                                )}
                                                {surgery.status === 'PRE_OP' && (
                                                    <button onClick={() => handleWorkflowTransition(surgery._id, 'READY_FOR_OT')} style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Mark Ready for OT</button>
                                                )}
                                                {surgery.status === 'READY_FOR_OT' && (
                                                    <button onClick={() => handleWorkflowTransition(surgery._id, 'IN_OT')} style={{ padding: '4px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Send to OT</button>
                                                )}
                                                {surgery.status === 'IN_OT' && (
                                                    <button onClick={() => handleWorkflowTransition(surgery._id, 'SURGERY_COMPLETED')} style={{ padding: '4px 10px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Complete Surgery</button>
                                                )}
                                                {surgery.status === 'SURGERY_COMPLETED' && (
                                                    <>
                                                        <button onClick={() => handleOpenWorkflowModal(surgery._id, surgery.patientId?._id, 'TRANSFER')} style={{ padding: '4px 10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Transfer Bed</button>
                                                        <button onClick={() => handleWorkflowTransition(surgery._id, 'POST_OP')} style={{ padding: '4px 10px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Post-Op (Same Bed)</button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* OT Room Status */}
                <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiBox /> OT Room Status
                        </h3>
                    </div>
                    <div style={{ padding: '20px' }}>
                        {rooms.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#64748b', padding: '20px 0' }}>
                                No OT Rooms configured yet.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {rooms.map(room => {
                                    // Calculate live status based on today's surgeries
                                    const now = new Date();
                                    const currentHourMin = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                                    const isOccupied = scheduledSurgeries.some(s => s.otRoomId?._id === room._id && s.startTime <= currentHourMin && s.endTime >= currentHourMin);
                                    const displayStatus = isOccupied ? 'Occupied' : 'Available';

                                    return (
                                        <div key={room._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontWeight: 600, color: '#334155' }}>{room.name}</div>
                                            <span style={{ 
                                                fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px',
                                                background: displayStatus === 'Available' ? '#dcfce7' : '#fee2e2',
                                                color: displayStatus === 'Available' ? '#166534' : '#991b1b'
                                            }}>
                                                {displayStatus}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        
            {/* Workflow Modal (Admit / Transfer) */}
            {showWorkflowModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.8)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', width: '400px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem' }}>{workflowActionType === 'ADMIT' ? 'Admit Patient' : 'Transfer Bed'}</h3>
                            <button onClick={() => setShowWorkflowModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                        </div>
                        <form onSubmit={handleWorkflowModalSubmit} style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Select Bed *</label>
                                    <select required value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', color: '#0f172a' }}>
                                        <option value="">Select an available bed</option>
                                        {workflowBeds.map(b => <option key={b._id} value={b._id}>{b.ward} - {b.bedNumber} ({b.bedType})</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button type="button" onClick={() => setShowWorkflowModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Confirm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
</div>
    );
};

export default OTDashboard;
