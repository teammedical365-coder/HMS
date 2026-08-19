import React, { useState, useEffect, useMemo } from 'react';
import { otAPI, admissionAPI, bedAPI, doctorAPI } from '../../utils/api';
import socket from '../../utils/socket';
import { 
    FiActivity, FiCalendar, FiCheckCircle, FiClock, FiUsers, FiBox, 
    FiAlertTriangle, FiEye, FiRefreshCw, FiSearch, FiCheck, FiChevronRight, 
    FiAlertOctagon, FiAlertCircle, FiInfo, FiPlus, FiX, FiDollarSign
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

const OTDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [roomBoardData, setRoomBoardData] = useState({ rooms: [], summary: { total: 0, available: 0, scheduled: 0, inOt: 0, delayed: 0 } });
    const [workflowAlertsData, setWorkflowAlertsData] = useState({
        workflowSummary: { scheduled: 0, admitted: 0, preOp: 0, readyForOt: 0, inOt: 0, completed: 0, postOp: 0, total: 0 },
        patients: [],
        alerts: []
    });
    const [scheduledSurgeries, setScheduledSurgeries] = useState([]);
    const [plannedSurgeries, setPlannedSurgeries] = useState([]);
    const [otRoomsList, setOtRoomsList] = useState([]);
    const [doctorsList, setDoctorsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // OT Room Board Filter state
    const [roomFilter, setRoomFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'SCHEDULED', 'IN_OT', 'DELAYED'

    // Workflow Tracker Filter & Search states
    const [workflowFilter, setWorkflowFilter] = useState('ALL'); // 'ALL', 'SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'COMPLETED', 'POST_OP'
    const [searchQuery, setSearchQuery] = useState('');

    // Modal states
    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [workflowActionType, setWorkflowActionType] = useState(null); // 'ADMIT' or 'TRANSFER'
    const [activeSurgeryId, setActiveSurgeryId] = useState(null);
    const [activePatientId, setActivePatientId] = useState(null);
    const [workflowBeds, setWorkflowBeds] = useState([]);
    const [selectedBedId, setSelectedBedId] = useState('');

    // Schedule Surgery Modal (Planned -> Scheduled Bridge)
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [activePlanToSchedule, setActivePlanToSchedule] = useState(null);
    const [selectedAssistantToAdd, setSelectedAssistantToAdd] = useState('');
    const [scheduleForm, setScheduleForm] = useState({
        otRoomId: '',
        surgeryDate: '',
        startTime: '',
        endTime: '',
        surgeonId: '',
        assistantSurgeonIds: [],
        surgeryCost: 0,
        priority: 'Normal',
        notes: ''
    });
    const [scheduling, setScheduling] = useState(false);
    const [scheduleError, setScheduleError] = useState('');

    // View Details Modal
    const [viewDetailsModal, setViewDetailsModal] = useState({ open: false, surgery: null });

    const fetchDashboardData = async () => {
        setLoading(true);
        setError(null);
        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const [statsRes, roomStatusRes, workflowAlertsRes, scheduleRes, plannedRes, roomsRes, docsRes] = await Promise.all([
                otAPI.getDashboardStats(),
                otAPI.getRoomStatus ? otAPI.getRoomStatus(todayStr) : otAPI.getRooms(),
                otAPI.getWorkflowAlerts ? otAPI.getWorkflowAlerts(todayStr) : Promise.resolve({ success: false }),
                otAPI.getTodaySchedule ? otAPI.getTodaySchedule(todayStr) : otAPI.getScheduledSurgeries(todayStr),
                otAPI.getPlannedSurgeries ? otAPI.getPlannedSurgeries() : Promise.resolve({ success: true, plans: [] }),
                otAPI.getRooms ? otAPI.getRooms() : Promise.resolve({ success: true, rooms: [] }),
                doctorAPI.getDoctors().catch(() => ({ success: false, doctors: [] }))
            ]);

            if (statsRes.success) setStats(statsRes.stats);
            if (roomStatusRes.success) {
                setRoomBoardData({
                    rooms: roomStatusRes.rooms || [],
                    summary: roomStatusRes.summary || {
                        total: roomStatusRes.rooms?.length || 0,
                        available: roomStatusRes.rooms?.filter(r => r.status === 'AVAILABLE').length || 0,
                        scheduled: roomStatusRes.rooms?.filter(r => r.status === 'SCHEDULED').length || 0,
                        inOt: roomStatusRes.rooms?.filter(r => r.status === 'IN_OT').length || 0,
                        delayed: roomStatusRes.rooms?.filter(r => r.status === 'DELAYED').length || 0
                    }
                });
            }
            if (workflowAlertsRes.success) {
                setWorkflowAlertsData(workflowAlertsRes);
            }
            const surgeriesList = scheduleRes.surgeries || scheduleRes.scheduled || [];
            setScheduledSurgeries(surgeriesList);

            if (plannedRes.success) {
                setPlannedSurgeries(plannedRes.plans || plannedRes.data || []);
            }
            if (roomsRes.success) {
                setOtRoomsList(roomsRes.rooms || []);
            }
            if (docsRes.success || docsRes.doctors) {
                setDoctorsList(docsRes.doctors || docsRes.data || []);
            }
        } catch (err) {
            console.error("Error fetching OT dashboard data:", err);
            setError(err.response?.data?.message || "Unable to load OT dashboard data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();

        // Real-Time Socket.IO event listener
        const handleOtUpdate = () => {
            fetchDashboardData();
        };

        socket.on('ot_update', handleOtUpdate);
        socket.on('ot_surgery_scheduled', handleOtUpdate);
        return () => {
            socket.off('ot_update', handleOtUpdate);
            socket.off('ot_surgery_scheduled', handleOtUpdate);
        };
    }, []);

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
                const targetBed = workflowBeds.find(b => b._id === selectedBedId);
                const admRes = await admissionAPI.createAdmission({
                    patientId: activePatientId,
                    ward: targetBed?.ward,
                    bedId: selectedBedId,
                    admissionDate: new Date().toISOString().split('T')[0],
                    admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                });
                if (admRes.success) {
                    await otAPI.updateSurgeryWorkflow(activeSurgeryId, { status: 'ADMITTED' });
                }
            } else if (workflowActionType === 'TRANSFER') {
                const actAdmRes = await admissionAPI.getPatientAdmissions(activePatientId);
                const activeAdm = actAdmRes.admissions?.find(a => a.status === 'Admitted');
                if (activeAdm) {
                    const targetBed = workflowBeds.find(b => b._id === selectedBedId);
                    const transRes = await admissionAPI.transferBed(activeAdm._id, {
                        newWard: targetBed?.ward,
                        newBedId: selectedBedId,
                        transferDate: new Date().toISOString().split('T')[0],
                        transferTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                    });
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

    // Schedule Surgery Handlers (Planned -> Scheduled Bridge)
    const handleOpenScheduleModal = (plan) => {
        setActivePlanToSchedule(plan);
        setScheduleError('');
        setSelectedAssistantToAdd('');
        
        const existingAssistantIds = (plan.assistantSurgeonIds || []).map(a => (typeof a === 'object' && a._id ? a._id : a));
        const primarySurgeonId = (plan.surgeonId && typeof plan.surgeonId === 'object' && plan.surgeonId._id) 
            ? plan.surgeonId._id 
            : (plan.surgeonId || '');

        setScheduleForm({
            otRoomId: plan.otRoomId?._id || plan.otRoomId || '',
            surgeryDate: plan.surgeryDate ? String(plan.surgeryDate).split('T')[0] : (plan.preferredDate ? String(plan.preferredDate).split('T')[0] : new Date().toISOString().split('T')[0]),
            startTime: plan.startTime || plan.preferredTime || '09:00',
            endTime: plan.endTime || '11:00',
            surgeonId: primarySurgeonId,
            assistantSurgeonIds: existingAssistantIds,
            surgeryCost: plan.surgeryCost || 0,
            priority: plan.priority || 'Normal',
            notes: plan.notes || ''
        });
        setShowScheduleModal(true);
    };

    const handleAddAssistant = () => {
        if (!selectedAssistantToAdd) return;
        
        // Assistant Rule 1: Operating Surgeon must NOT be added as assistant
        if (selectedAssistantToAdd === scheduleForm.surgeonId) {
            setScheduleError('The Operating Surgeon cannot also be added as a Surgical Assistant.');
            return;
        }
        // Assistant Rule 2: Duplicate assistant not allowed
        if (scheduleForm.assistantSurgeonIds.includes(selectedAssistantToAdd)) {
            setScheduleError('This doctor has already been added as a surgical assistant.');
            return;
        }

        setScheduleError('');
        setScheduleForm(prev => ({
            ...prev,
            assistantSurgeonIds: [...prev.assistantSurgeonIds, selectedAssistantToAdd]
        }));
        setSelectedAssistantToAdd('');
    };

    const handleRemoveAssistant = (docId) => {
        setScheduleForm(prev => ({
            ...prev,
            assistantSurgeonIds: prev.assistantSurgeonIds.filter(id => id !== docId)
        }));
    };

    const handleScheduleSubmit = async (e) => {
        e.preventDefault();
        if (!scheduleForm.surgeonId) return setScheduleError('Please select an Operating Surgeon');
        if (!scheduleForm.otRoomId) return setScheduleError('Please select an OT Room');
        if (!scheduleForm.surgeryDate) return setScheduleError('Please select a Surgery Date');
        if (!scheduleForm.startTime || !scheduleForm.endTime) return setScheduleError('Please specify Start Time and End Time');
        if (scheduleForm.startTime >= scheduleForm.endTime) return setScheduleError('End Time must be after Start Time');

        // Check if Operating Surgeon was inadvertently included in assistants
        if (scheduleForm.assistantSurgeonIds.includes(scheduleForm.surgeonId)) {
            return setScheduleError('The Operating Surgeon cannot also be added as an assistant. Please remove them from assistants.');
        }

        setScheduling(true);
        setScheduleError('');
        try {
            const res = await otAPI.scheduleSurgery(activePlanToSchedule._id, scheduleForm);
            if (res.success) {
                setShowScheduleModal(false);
                setActivePlanToSchedule(null);
                fetchDashboardData();
            } else {
                setScheduleError(res.message || 'Failed to schedule surgery');
            }
        } catch (err) {
            console.error('Error scheduling surgery:', err);
            setScheduleError(err.response?.data?.message || 'Error scheduling surgery');
        } finally {
            setScheduling(false);
        }
    };

    // Calculate real elapsed time for IN_OT surgeries
    const getElapsedTime = (actualStartTime) => {
        if (!actualStartTime) return null;
        const start = new Date(actualStartTime).getTime();
        const diffMs = Math.max(0, Date.now() - start);
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
    };

    // Check if a waiting surgery is delayed
    const checkIfDelayed = (surgery) => {
        const waitingStatuses = ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT'];
        if (!waitingStatuses.includes(surgery.status)) return false;
        if (!surgery.startTime) return false;

        const now = new Date();
        const currentTimeVal = now.getHours() * 60 + now.getMinutes();

        const match = String(surgery.startTime).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
        if (!match) return false;
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        const mer = match[3];
        if (mer) {
            if (mer.toUpperCase() === 'PM' && h < 12) h += 12;
            if (mer.toUpperCase() === 'AM' && h === 12) h = 0;
        }
        const scheduledTimeVal = h * 60 + m;

        return currentTimeVal > scheduledTimeVal;
    };

    const getStatusStyle = (status) => {
        switch(status) {
            case 'PLANNED':
                return { label: 'PLANNED', bg: '#fef3c7', color: '#b45309', border: '#fde68a', stepIndex: -1 };
            case 'SCHEDULED':
                return { label: 'SCHEDULED', bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe', stepIndex: 0 };
            case 'ADMITTED':
                return { label: 'ADMITTED', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', stepIndex: 1 };
            case 'PRE_OP':
                return { label: 'PRE-OP', bg: '#fef3c7', color: '#b45309', border: '#fde68a', stepIndex: 2 };
            case 'READY_FOR_OT':
                return { label: 'READY FOR OT', bg: '#f3e8ff', color: '#6b21a8', border: '#e9d5ff', stepIndex: 3 };
            case 'IN_OT':
                return { label: '🔴 IN OT', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', stepIndex: 4, isPulse: true };
            case 'SURGERY_COMPLETED':
                return { label: 'SURGERY DONE', bg: '#ccfbf1', color: '#0f766e', border: '#99f6e4', stepIndex: 5 };
            case 'POST_OP':
                return { label: 'POST-OP', bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc', stepIndex: 6 };
            case 'COMPLETED':
                return { label: '✓ COMPLETED', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', stepIndex: 6 };
            case 'CANCELLED':
                return { label: 'CANCELLED', bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1', stepIndex: -1 };
            default:
                return { label: status, bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', stepIndex: 0 };
        }
    };

    const getRoomBoardStatusStyle = (status) => {
        switch(status) {
            case 'IN_OT':
                return { label: '🔴 IN OT', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', cardBg: '#fff1f2', cardBorder: '#fda4af' };
            case 'DELAYED':
                return { label: '🟠 DELAYED', bg: '#ffedd5', color: '#c2410c', border: '#fed7aa', cardBg: '#fffaf5', cardBorder: '#fed7aa' };
            case 'SCHEDULED':
                return { label: '🔵 SCHEDULED', bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe', cardBg: '#f8fafc', cardBorder: '#e2e8f0' };
            case 'AVAILABLE':
                return { label: '🟢 AVAILABLE', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', cardBg: '#f0fdf4', cardBorder: '#bbf7d0' };
            case 'MAINTENANCE':
                return { label: '⚪ MAINTENANCE', bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1', cardBg: '#f8fafc', cardBorder: '#e2e8f0' };
            default:
                return { label: status, bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', cardBg: '#fff', cardBorder: '#e2e8f0' };
        }
    };

    // Filtered rooms for Live OT Board
    const filteredRooms = useMemo(() => {
        if (roomFilter === 'ALL') return roomBoardData.rooms;
        return roomBoardData.rooms.filter(r => r.status === roomFilter);
    }, [roomBoardData.rooms, roomFilter]);

    // Filtered & Searched patients for Workflow Tracker
    const filteredWorkflowPatients = useMemo(() => {
        let list = workflowAlertsData.patients || scheduledSurgeries || [];
        
        // Filter by stage
        if (workflowFilter !== 'ALL') {
            if (workflowFilter === 'COMPLETED') {
                list = list.filter(p => p.status === 'SURGERY_COMPLETED' || p.status === 'COMPLETED');
            } else {
                list = list.filter(p => p.status === workflowFilter);
            }
        }

        // Local search by patient name, MRN, procedure
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(p => {
                const name = (p.patientId?.name || '').toLowerCase();
                const mrn = (p.patientId?.mrn || p.patientId?.patientId || '').toLowerCase();
                const proc = (p.surgery || '').toLowerCase();
                const doc = (p.surgeonId?.name || '').toLowerCase();
                return name.includes(q) || mrn.includes(q) || proc.includes(q) || doc.includes(q);
            });
        }

        return list;
    }, [workflowAlertsData.patients, scheduledSurgeries, workflowFilter, searchQuery]);

    const pipelineStages = [
        { key: 'SCHEDULED', label: 'Scheduled', count: workflowAlertsData.workflowSummary.scheduled, color: '#4f46e5', bg: '#e0e7ff' },
        { key: 'ADMITTED', label: 'Admitted', count: workflowAlertsData.workflowSummary.admitted, color: '#2563eb', bg: '#eff6ff' },
        { key: 'PRE_OP', label: 'Pre-Op', count: workflowAlertsData.workflowSummary.preOp, color: '#d97706', bg: '#fef3c7' },
        { key: 'READY_FOR_OT', label: 'Ready for OT', count: workflowAlertsData.workflowSummary.readyForOt, color: '#7c3aed', bg: '#f3e8ff' },
        { key: 'IN_OT', label: 'In OT', count: workflowAlertsData.workflowSummary.inOt, color: '#dc2626', bg: '#fee2e2' },
        { key: 'COMPLETED', label: 'Surgery Done', count: workflowAlertsData.workflowSummary.completed, color: '#0d9488', bg: '#ccfbf1' },
        { key: 'POST_OP', label: 'Post-Op', count: workflowAlertsData.workflowSummary.postOp, color: '#0891b2', bg: '#ecfeff' }
    ];

    const summaryCards = [
        { label: "Planned Surgeries", value: plannedSurgeries.length, icon: <FiClock />, color: '#f59e0b', bg: '#fffbeb' },
        { label: "Today's Surgeries", value: stats?.todaySurgeries ?? 0, icon: <FiActivity />, color: '#3b82f6', bg: '#eff6ff' },
        { label: "Upcoming Surgeries", value: stats?.upcomingSurgeries ?? 0, icon: <FiCalendar />, color: '#8b5cf6', bg: '#f5f3ff' },
        { label: "Available OT Rooms", value: stats?.availableRooms ?? 0, icon: <FiCheckCircle />, color: '#10b981', bg: '#ecfdf5' },
        { label: "Occupied OT Rooms", value: stats?.occupiedRooms ?? 0, icon: <FiClock />, color: '#ef4444', bg: '#fef2f2' },
        { label: "Pre-Op Patients", value: stats?.preOpPatients ?? 0, icon: <FiUsers />, color: '#8b5cf6', bg: '#f5f3ff' },
    ];

    return (
        <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.5rem', fontWeight: 800 }}>🔪 Operation Theatre Dashboard</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        Live surgery tracking, OT room board, patient workflow, and clinical alerts.
                    </p>
                </div>
                <button
                    onClick={fetchDashboardData}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#334155', fontSize: '0.88rem' }}
                >
                    <FiRefreshCw className={loading ? 'spin' : ''} /> Refresh Dashboard
                </button>
            </div>

            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                {summaryCards.map((card, idx) => (
                    <div key={idx} style={{ background: '#fff', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: card.bg, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>
                            {card.icon}
                        </div>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, marginBottom: '2px' }}>{card.label}</div>
                            <div style={{ color: '#0f172a', fontSize: '1.45rem', fontWeight: 800 }}>
                                {loading ? '...' : card.value}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ========================================================================= */}
            {/* ====== PLANNED SURGERIES (SURGERY PLAN -> OT SCHEDULING BRIDGE) ====== */}
            {/* ========================================================================= */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', marginBottom: '32px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                            <FiClock />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 800 }}>
                                📋 Planned Surgeries (Awaiting OT Scheduling)
                            </h3>
                            <span style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                                {plannedSurgeries.length} surger{plannedSurgeries.length === 1 ? 'y' : 'ies'} planned by doctors awaiting OT room & time slot assignment
                            </span>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px' }}>
                    {plannedSurgeries.length === 0 ? (
                        <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                            <div style={{ color: '#94a3b8', fontSize: '2.5rem', marginBottom: '10px' }}><FiCheckCircle /></div>
                            <h4 style={{ margin: '0 0 6px', color: '#334155', fontSize: '1.05rem' }}>No planned surgeries awaiting scheduling</h4>
                            <p style={{ color: '#64748b', margin: 0, fontSize: '0.88rem' }}>When doctors create surgery plans during consultation, they will appear here for OT room & timing assignment.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {plannedSurgeries.map((sp) => {
                                const patientName = sp.patientId?.name || 'Patient';
                                const patientMrn = sp.patientId?.mrn || sp.patientId?.patientId || '-';
                                const surgeonName = (sp.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                                const docName = sp.doctorId?.name ? sp.doctorId?.name.replace(/^Dr\.?\s*/i, '') : null;
                                const refName = sp.referringDoctorId?.name ? sp.referringDoctorId?.name.replace(/^Dr\.?\s*/i, '') : null;
                                const prefDateStr = sp.preferredDate ? new Date(sp.preferredDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Flexible';

                                return (
                                    <div
                                        key={sp._id}
                                        style={{
                                            padding: '16px 18px',
                                            background: '#f8fafc',
                                            borderRadius: '10px',
                                            border: '1px solid #e2e8f0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '14px'
                                        }}
                                    >
                                        <div style={{ flex: '1 1 260px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}>
                                                    {sp.surgery}
                                                </span>
                                                {sp.planId && (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px' }}>
                                                        {sp.planId}
                                                    </span>
                                                )}
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '12px' }}>
                                                    PLANNED
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.86rem', color: '#334155', marginTop: '4px' }}>
                                                👤 <strong>{patientName}</strong> • MRN: {patientMrn} {sp.diagnosis ? `• Dx: ${sp.diagnosis}` : ''}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                                👨‍⚕️ Operating Surgeon: <strong>Dr. {surgeonName}</strong>
                                                {(refName || docName) && (refName !== surgeonName && docName !== surgeonName) && (
                                                    <span> • Referring: Dr. {refName || docName}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ minWidth: '150px' }}>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>PREFERRED TIMING</div>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                                                📅 {prefDateStr}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                                                ⏰ {sp.preferredTime || 'Flexible'} {sp.admissionRequired ? '• 🏥 Admission Req' : ''}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                                onClick={() => setViewDetailsModal({ open: true, surgery: sp })}
                                                style={{ padding: '8px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <FiEye /> View Plan
                                            </button>
                                            <button
                                                onClick={() => handleOpenScheduleModal(sp)}
                                                style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(124,58,237,0.2)' }}
                                            >
                                                <FiCalendar /> Schedule Surgery
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ========================================================================= */}
            {/* ====== STEP 4 PART B: ATTENTION REQUIRED / OT ALERTS ====== */}
            {/* ========================================================================= */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', marginBottom: '32px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: workflowAlertsData.alerts.length > 0 ? '#fff1f2' : '#f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {workflowAlertsData.alerts.length > 0 ? (
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ffe4e6', color: '#e11d48', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                <FiAlertOctagon />
                            </div>
                        ) : (
                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                                <FiCheckCircle />
                            </div>
                        )}
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: 800 }}>
                                Attention Required
                            </h3>
                            <span style={{ fontSize: '0.82rem', color: workflowAlertsData.alerts.length > 0 ? '#be123c' : '#15803d', fontWeight: 600 }}>
                                {workflowAlertsData.alerts.length > 0 
                                    ? `${workflowAlertsData.alerts.length} action item${workflowAlertsData.alerts.length > 1 ? 's' : ''} require clinical / OT attention` 
                                    : '✓ All OT operations are on track.'}
                            </span>
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px' }}>
                    {workflowAlertsData.alerts.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '0.92rem', fontWeight: 600 }}>
                            <FiCheckCircle style={{ fontSize: '1.3rem' }} /> All scheduled surgeries and OT rooms have zero conflicts or delay warnings.
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                            {workflowAlertsData.alerts.map((alert) => {
                                const isCritical = alert.severity === 'CRITICAL';
                                const isAction = alert.severity === 'ACTION_REQUIRED';
                                const badgeColor = isCritical ? '#dc2626' : isAction ? '#d97706' : '#2563eb';
                                const badgeBg = isCritical ? '#fef2f2' : isAction ? '#fffbeb' : '#eff6ff';
                                const borderColor = isCritical ? '#fecaca' : isAction ? '#fde68a' : '#bfdbfe';

                                return (
                                    <div
                                        key={alert.id}
                                        style={{
                                            padding: '16px',
                                            borderRadius: '10px',
                                            border: `1.5px solid ${borderColor}`,
                                            background: badgeBg,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: '12px'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: borderColor, color: badgeColor, textTransform: 'uppercase' }}>
                                                    {isCritical ? '🔴 Critical' : isAction ? '🟠 Action Required' : '🟡 Informational'}
                                                </span>
                                            </div>
                                            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', marginBottom: '4px' }}>
                                                {alert.title}
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569', lineHeight: 1.4 }}>
                                                {alert.message}
                                            </p>
                                        </div>
                                        {alert.surgeryData && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: `1px solid ${borderColor}` }}>
                                                <button
                                                    onClick={() => setViewDetailsModal({ open: true, surgery: alert.surgeryData })}
                                                    style={{ padding: '5px 12px', background: '#fff', border: `1px solid ${borderColor}`, borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <FiEye /> View Details
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ========================================================================= */}
            {/* ====== STEP 4 PART A: PATIENT WORKFLOW TRACKER PIPELINE ====== */}
            {/* ========================================================================= */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', marginBottom: '32px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiUsers style={{ color: '#06b6d4' }} /> Today's Patient Workflow Tracker
                        </h3>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Stage-by-stage patient journey for today's surgery schedule ({workflowAlertsData.workflowSummary.total} active patients)
                        </span>
                    </div>

                    {/* Search Field */}
                    <div style={{ position: 'relative', minWidth: '260px' }}>
                        <FiSearch style={{ position: 'absolute', left: '12px', top: '10px', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Search patient, MRN, procedure..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', color: '#0f172a', outline: 'none' }}
                        />
                    </div>
                </div>

                {/* Workflow Stepper / Pipeline Stage Cards */}
                <div style={{ padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#fcfcfd' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                        {pipelineStages.map((stage, idx) => {
                            const isSelected = workflowFilter === stage.key;
                            return (
                                <button
                                    key={stage.key}
                                    onClick={() => setWorkflowFilter(workflowFilter === stage.key ? 'ALL' : stage.key)}
                                    style={{
                                        background: isSelected ? stage.bg : '#fff',
                                        border: isSelected ? `2px solid ${stage.color}` : '1px solid #e2e8f0',
                                        borderRadius: '10px',
                                        padding: '12px 14px',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'all 0.15s',
                                        boxShadow: isSelected ? '0 4px 10px rgba(0,0,0,0.06)' : '0 1px 2px rgba(0,0,0,0.02)'
                                    }}
                                >
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: stage.color, textTransform: 'uppercase', marginBottom: '2px' }}>
                                        {idx + 1}. {stage.label}
                                    </div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                                        {stage.count}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {workflowFilter !== 'ALL' && (
                        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: '#475569' }}>
                            <span>Filtered by: <strong>{workflowFilter}</strong></span>
                            <button onClick={() => setWorkflowFilter('ALL')} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                Clear Filter
                            </button>
                        </div>
                    )}
                </div>

                {/* Patient List with Stage Progress Bars */}
                <div style={{ padding: '20px' }}>
                    {filteredWorkflowPatients.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
                            <h4 style={{ margin: '0 0 4px', color: '#334155' }}>No patients found</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>No patients matching the current workflow stage or search query.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {filteredWorkflowPatients.map((p) => {
                                const badge = getStatusStyle(p.status);
                                const isDelayed = checkIfDelayed(p);
                                const isCurrentInOt = p.status === 'IN_OT';
                                const elapsed = isCurrentInOt ? getElapsedTime(p.actualStartTime) : null;
                                const patientName = p.patientId?.name || 'Patient';
                                const patientMrn = p.patientId?.mrn || p.patientId?.patientId || '-';
                                const surgeonName = (p.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                                const roomName = p.otRoomId?.name || 'Not Assigned';

                                const stagesList = ['SCHEDULED', 'ADMITTED', 'PRE_OP', 'READY_FOR_OT', 'IN_OT', 'SURGERY_COMPLETED', 'POST_OP'];
                                const currentStepIdx = stagesList.indexOf(p.status === 'COMPLETED' ? 'SURGERY_COMPLETED' : p.status);

                                return (
                                    <div
                                        key={p._id}
                                        style={{
                                            padding: '16px 18px',
                                            background: isCurrentInOt ? '#fff1f2' : '#f8fafc',
                                            borderRadius: '10px',
                                            border: isCurrentInOt ? '1.5px solid #fda4af' : '1px solid #e2e8f0',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '12px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                            {/* Patient Info */}
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                                                        👤 {patientName}
                                                    </span>
                                                    <span style={{ fontSize: '0.78rem', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                        MRN: {patientMrn}
                                                    </span>
                                                    {isDelayed && (
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 6px', borderRadius: '4px' }}>
                                                            ⚠️ Delayed
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '3px' }}>
                                                    <strong>{p.surgery}</strong> • 👨‍⚕️ Dr. {surgeonName} • 🚪 {roomName} • ⏰ {p.startTime || '--:--'}
                                                </div>
                                            </div>

                                            {/* Current Badge & Actions */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{
                                                    padding: '5px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    background: badge.bg,
                                                    color: badge.color,
                                                    border: `1px solid ${badge.border}`
                                                }}>
                                                    {badge.label} {isCurrentInOt && elapsed ? `(${elapsed})` : ''}
                                                </span>
                                                <button
                                                    onClick={() => setViewDetailsModal({ open: true, surgery: p })}
                                                    style={{ padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <FiEye /> View
                                                </button>
                                            </div>
                                        </div>

                                        {/* Visual Workflow Breadcrumb Bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', padding: '6px 0', fontSize: '0.72rem', fontWeight: 700 }}>
                                            {[
                                                { label: 'Scheduled', idx: 0 },
                                                { label: 'Admitted', idx: 1 },
                                                { label: 'Pre-Op', idx: 2 },
                                                { label: 'Ready', idx: 3 },
                                                { label: 'In OT', idx: 4 },
                                                { label: 'Done', idx: 5 },
                                                { label: 'Post-Op', idx: 6 }
                                            ].map((st, sIdx) => {
                                                const isCompleted = currentStepIdx > st.idx;
                                                const isCurrent = currentStepIdx === st.idx;
                                                return (
                                                    <React.Fragment key={st.label}>
                                                        {sIdx > 0 && <FiChevronRight style={{ color: '#cbd5e1', flexShrink: 0 }} />}
                                                        <span
                                                            style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: isCurrent ? '#1e293b' : isCompleted ? '#dcfce7' : '#f1f5f9',
                                                                color: isCurrent ? '#fff' : isCompleted ? '#15803d' : '#94a3b8',
                                                                border: isCurrent ? '1px solid #0f172a' : isCompleted ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            {isCompleted ? '✓ ' : ''}{st.label}
                                                        </span>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ========================================================================= */}
            {/* ====== STEP 3: LIVE OT ROOM STATUS / OT ROOM BOARD SECTION ====== */}
            {/* ========================================================================= */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', marginBottom: '32px' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiBox style={{ color: '#8b5cf6' }} /> Live OT Room Board
                        </h3>
                        <div style={{ display: 'flex', gap: '14px', fontSize: '0.82rem', color: '#475569', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span>All Rooms: <strong>{roomBoardData.summary.total}</strong></span>
                            <span>• Available: <strong style={{ color: '#16a34a' }}>{roomBoardData.summary.available}</strong></span>
                            <span>• Scheduled: <strong style={{ color: '#4f46e5' }}>{roomBoardData.summary.scheduled}</strong></span>
                            <span>• In OT: <strong style={{ color: '#dc2626' }}>{roomBoardData.summary.inOt}</strong></span>
                            <span>• Delayed: <strong style={{ color: '#ea580c' }}>{roomBoardData.summary.delayed}</strong></span>
                        </div>
                    </div>

                    {/* Room Filters */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                            { key: 'ALL', label: `All (${roomBoardData.summary.total})` },
                            { key: 'AVAILABLE', label: `Available (${roomBoardData.summary.available})` },
                            { key: 'SCHEDULED', label: `Scheduled (${roomBoardData.summary.scheduled})` },
                            { key: 'IN_OT', label: `In OT (${roomBoardData.summary.inOt})` },
                            { key: 'DELAYED', label: `Delayed (${roomBoardData.summary.delayed})` }
                        ].map(f => (
                            <button
                                key={f.key}
                                onClick={() => setRoomFilter(f.key)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: roomFilter === f.key ? '1.5px solid #8b5cf6' : '1px solid #cbd5e1',
                                    background: roomFilter === f.key ? '#f5f3ff' : '#fff',
                                    color: roomFilter === f.key ? '#7c3aed' : '#475569',
                                    fontWeight: roomFilter === f.key ? 700 : 600,
                                    fontSize: '0.8rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ padding: '20px' }}>
                    {/* No Rooms Configured */}
                    {!loading && !error && roomBoardData.rooms.length === 0 && (
                        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <div style={{ color: '#94a3b8', fontSize: '2.5rem', marginBottom: '10px' }}><FiBox /></div>
                            <h4 style={{ margin: '0 0 6px', color: '#334155', fontSize: '1.05rem' }}>No OT rooms configured</h4>
                            <p style={{ color: '#64748b', margin: 0, fontSize: '0.88rem' }}>Hospital admin can add OT rooms from Settings.</p>
                        </div>
                    )}

                    {/* Rooms Grid */}
                    {!loading && !error && filteredRooms.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
                            {filteredRooms.map(room => {
                                const bStyle = getRoomBoardStatusStyle(room.status);
                                const currentS = room.currentSurgery;
                                const nextS = room.nextSurgery;
                                const elapsed = currentS?.status === 'IN_OT' ? getElapsedTime(currentS.actualStartTime) : null;

                                return (
                                    <div
                                        key={room._id}
                                        style={{
                                            background: bStyle.cardBg,
                                            border: `1.5px solid ${bStyle.cardBorder}`,
                                            borderRadius: '12px',
                                            padding: '18px 20px',
                                            boxShadow: room.status === 'IN_OT' ? '0 8px 20px rgba(225,29,72,0.1)' : '0 2px 4px rgba(0,0,0,0.03)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            minHeight: '220px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div>
                                            {/* Room Header */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                                                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a' }}>
                                                    {room.name}
                                                </div>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 800,
                                                    padding: '4px 12px',
                                                    borderRadius: '20px',
                                                    background: bStyle.bg,
                                                    color: bStyle.color,
                                                    border: `1px solid ${bStyle.border}`,
                                                    letterSpacing: '0.3px'
                                                }}>
                                                    {bStyle.label}
                                                </span>
                                            </div>

                                            {/* ACTIVE IN_OT SURGERY */}
                                            {room.status === 'IN_OT' && currentS && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <div style={{ fontWeight: 800, color: '#9f1239', fontSize: '1rem', marginBottom: '2px' }}>
                                                        {currentS.surgery}
                                                    </div>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>
                                                        👤 {currentS.patientId?.name || 'Patient'} <span style={{ color: '#64748b', fontSize: '0.78rem' }}>[MRN: {currentS.patientId?.mrn || currentS.patientId?.patientId || '-'}]</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px' }}>
                                                        👨‍⚕️ Surgeon: <strong>Dr. {(currentS.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '')}</strong>
                                                    </div>
                                                    <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '2px' }}>
                                                        ⏰ Scheduled: {currentS.startTime || '--:--'} - {currentS.endTime || '--:--'}
                                                    </div>
                                                    {currentS.actualStartTime && (
                                                        <div style={{ background: '#ffe4e6', padding: '6px 10px', borderRadius: '6px', marginTop: '8px', fontSize: '0.78rem', color: '#9f1239', fontWeight: 700 }}>
                                                            ⏱️ Started: {new Date(currentS.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {elapsed ? `(${elapsed} elapsed)` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* DELAYED SURGERY */}
                                            {room.status === 'DELAYED' && currentS && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <div style={{ fontWeight: 800, color: '#c2410c', fontSize: '0.98rem', marginBottom: '2px' }}>
                                                        {currentS.surgery}
                                                    </div>
                                                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b' }}>
                                                        👤 {currentS.patientId?.name || 'Patient'} <span style={{ color: '#64748b', fontSize: '0.78rem' }}>[MRN: {currentS.patientId?.mrn || currentS.patientId?.patientId || '-'}]</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '4px' }}>
                                                        👨‍⚕️ Surgeon: <strong>Dr. {(currentS.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '')}</strong>
                                                    </div>
                                                    <div style={{ background: '#ffedd5', border: '1px solid #fed7aa', padding: '6px 10px', borderRadius: '6px', marginTop: '8px', fontSize: '0.78rem', color: '#c2410c', fontWeight: 700 }}>
                                                        ⚠️ Scheduled for {currentS.startTime} (Awaiting OT entry)
                                                    </div>
                                                </div>
                                            )}

                                            {/* SCHEDULED UPCOMING SURGERY */}
                                            {room.status === 'SCHEDULED' && nextS && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <div style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600, marginBottom: '6px' }}>
                                                        🟢 Room Free Right Now
                                                    </div>
                                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 12px' }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginBottom: '2px' }}>
                                                            NEXT AT {nextS.startTime || '--:--'}
                                                        </div>
                                                        <div style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '0.92rem' }}>
                                                            {nextS.surgery}
                                                        </div>
                                                        <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '2px' }}>
                                                            👤 {nextS.patientId?.name} • 👨‍⚕️ Dr. {(nextS.surgeonId?.name || '').replace(/^Dr\.?\s*/i, '')}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* AVAILABLE */}
                                            {room.status === 'AVAILABLE' && (
                                                <div style={{ marginBottom: '12px' }}>
                                                    <div style={{ fontSize: '0.88rem', color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                        <FiCheckCircle /> Available for procedures
                                                    </div>
                                                    {nextS ? (
                                                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 10px', fontSize: '0.8rem', color: '#14532d' }}>
                                                            <strong>Next Today:</strong> {nextS.startTime} — {nextS.surgery}
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                                            No other surgeries scheduled for today.
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* MAINTENANCE */}
                                            {room.status === 'MAINTENANCE' && (
                                                <div style={{ fontSize: '0.85rem', color: '#64748b', padding: '10px 0' }}>
                                                    ⚙️ {room.notes || 'Room is currently under maintenance / sterilization.'}
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Actions */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '10px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                                            {(currentS || nextS) && (
                                                <button
                                                    onClick={() => setViewDetailsModal({ open: true, surgery: currentS || nextS })}
                                                    style={{ padding: '6px 12px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
                                                >
                                                    <FiEye /> View Surgery
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ====== TODAY'S OT SCHEDULE SECTION ====== */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiActivity style={{ color: '#3b82f6' }} /> Today's OT Schedule
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} • {scheduledSurgeries.length} surgeries scheduled
                        </span>
                    </div>
                </div>

                <div style={{ padding: '16px' }}>
                    {/* Empty State */}
                    {!loading && !error && scheduledSurgeries.length === 0 && (
                        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                            <div style={{ color: '#94a3b8', fontSize: '2.5rem', marginBottom: '10px' }}><FiCalendar /></div>
                            <h4 style={{ margin: '0 0 6px', color: '#334155', fontSize: '1.05rem' }}>No surgeries scheduled for today</h4>
                            <p style={{ color: '#64748b', margin: 0, fontSize: '0.88rem' }}>Surgeries planned and scheduled for today will appear here chronologically.</p>
                        </div>
                    )}

                    {/* Surgeries List / Desktop Table */}
                    {!loading && !error && scheduledSurgeries.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {scheduledSurgeries.map((surgery) => {
                                const badge = getStatusStyle(surgery.status);
                                const isDelayed = checkIfDelayed(surgery);
                                const isCurrentInOt = surgery.status === 'IN_OT';
                                const elapsed = isCurrentInOt ? getElapsedTime(surgery.actualStartTime) : null;
                                const patientName = surgery.patientId?.name || 'Patient';
                                const patientMrn = surgery.patientId?.mrn || surgery.patientId?.patientId || '-';
                                const surgeonName = (surgery.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                                const doctorName = surgery.doctorId?.name ? (surgery.doctorId?.name).replace(/^Dr\.?\s*/i, '') : null;
                                const referringName = surgery.referringDoctorId?.name ? (surgery.referringDoctorId?.name).replace(/^Dr\.?\s*/i, '') : null;
                                const roomName = surgery.otRoomId?.name || 'Not Assigned';

                                return (
                                    <div
                                        key={surgery._id}
                                        style={{
                                            display: 'flex',
                                            gap: '16px',
                                            padding: '16px 18px',
                                            background: isCurrentInOt ? '#fff1f2' : '#f8fafc',
                                            borderRadius: '10px',
                                            border: isCurrentInOt ? '1.5px solid #fda4af' : '1px solid #e2e8f0',
                                            boxShadow: isCurrentInOt ? '0 4px 12px rgba(225,29,72,0.08)' : 'none',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        {/* Time Column */}
                                        <div style={{ minWidth: '110px' }}>
                                            <div style={{ fontWeight: 800, color: isCurrentInOt ? '#be123c' : '#0f172a', fontSize: '0.95rem' }}>
                                                {surgery.startTime || '--:--'} {surgery.endTime ? `- ${surgery.endTime}` : ''}
                                            </div>
                                            {isCurrentInOt && (
                                                <div style={{ fontSize: '0.75rem', color: '#e11d48', fontWeight: 700, marginTop: '3px' }}>
                                                    🔴 IN OT {elapsed ? `(${elapsed})` : ''}
                                                </div>
                                            )}
                                            {isDelayed && (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, marginTop: '3px' }}>
                                                    <FiAlertTriangle style={{ fontSize: '10px' }} /> Delayed
                                                </div>
                                            )}
                                        </div>

                                        {/* Patient & Procedure */}
                                        <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                                                {surgery.surgery}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#334155', marginTop: '2px' }}>
                                                <span style={{ fontWeight: 600 }}>👤 {patientName}</span>
                                                <span style={{ color: '#64748b', fontSize: '0.78rem' }}>[MRN: {patientMrn}]</span>
                                            </div>
                                            {surgery.diagnosis && (
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                                                    Dx: {surgery.diagnosis}
                                                </div>
                                            )}
                                        </div>

                                        {/* Surgeon & Room */}
                                        <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
                                            <div style={{ fontSize: '0.86rem', color: '#1e293b', fontWeight: 700 }}>
                                                👨‍⚕️ Op: Dr. {surgeonName}
                                            </div>
                                            {surgery.assistantSurgeonIds && surgery.assistantSurgeonIds.length > 0 && (
                                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px', lineHeight: 1.3 }}>
                                                    🤝 Asst: {surgery.assistantSurgeonIds.map(a => `Dr. ${(a.name || 'Doctor').replace(/^Dr\.?\s*/i, '')}`).join(', ')}
                                                </div>
                                            )}
                                            {(referringName || doctorName) && (referringName !== surgeonName && doctorName !== surgeonName) && (
                                                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '1px' }}>
                                                    Ref: Dr. {referringName || doctorName}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                <span style={{ display: 'inline-block', padding: '2px 8px', background: '#f1f5f9', color: '#334155', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
                                                    🚪 {roomName}
                                                </span>
                                                {surgery.surgeryCost > 0 && (
                                                    <span style={{
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        background: surgery.paymentStatus === 'PAID' ? '#dcfce7' : (surgery.paymentStatus === 'PARTIALLY PAID' ? '#fef3c7' : '#fee2e2'),
                                                        color: surgery.paymentStatus === 'PAID' ? '#15803d' : (surgery.paymentStatus === 'PARTIALLY PAID' ? '#b45309' : '#b91c1c'),
                                                        border: `1px solid ${surgery.paymentStatus === 'PAID' ? '#86efac' : (surgery.paymentStatus === 'PARTIALLY PAID' ? '#fde68a' : '#fca5a5')}`
                                                    }}>
                                                        ₹{Number(surgery.surgeryCost).toLocaleString('en-IN')} [{surgery.paymentStatus || 'UNPAID'}]
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div style={{ minWidth: '110px', textAlign: 'center' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '5px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                background: badge.bg,
                                                color: badge.color,
                                                border: `1px solid ${badge.border}`,
                                                letterSpacing: '0.3px'
                                            }}>
                                                {badge.label}
                                            </span>
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => setViewDetailsModal({ open: true, surgery })}
                                                style={{ padding: '6px 12px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <FiEye /> View
                                            </button>

                                            {surgery.status === 'SCHEDULED' && (
                                                <button onClick={() => surgery.admissionRequired ? handleOpenWorkflowModal(surgery._id, surgery.patientId?._id, 'ADMIT') : handleWorkflowTransition(surgery._id, 'PRE_OP')} style={{ padding: '6px 12px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    {surgery.admissionRequired ? 'Admit Patient' : 'Start Pre-Op'}
                                                </button>
                                            )}
                                            {surgery.status === 'ADMITTED' && (
                                                <button onClick={() => handleWorkflowTransition(surgery._id, 'PRE_OP')} style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    Start Pre-Op
                                                </button>
                                            )}
                                            {surgery.status === 'PRE_OP' && (
                                                <button onClick={() => handleWorkflowTransition(surgery._id, 'READY_FOR_OT')} style={{ padding: '6px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    Ready For OT
                                                </button>
                                            )}
                                            {surgery.status === 'READY_FOR_OT' && (
                                                <button onClick={() => handleWorkflowTransition(surgery._id, 'IN_OT')} style={{ padding: '6px 12px', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    Enter OT
                                                </button>
                                            )}
                                            {surgery.status === 'IN_OT' && (
                                                <button onClick={() => handleWorkflowTransition(surgery._id, 'SURGERY_COMPLETED')} style={{ padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    Complete Surgery
                                                </button>
                                            )}
                                            {surgery.status === 'SURGERY_COMPLETED' && (
                                                <button onClick={() => surgery.admissionRequired ? handleOpenWorkflowModal(surgery._id, surgery.patientId?._id, 'TRANSFER') : handleWorkflowTransition(surgery._id, 'POST_OP')} style={{ padding: '6px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    {surgery.admissionRequired ? 'Move to Post-Op Bed' : 'Post-Op Care'}
                                                </button>
                                            )}
                                            {surgery.status === 'POST_OP' && (
                                                <button onClick={() => handleWorkflowTransition(surgery._id, 'COMPLETED')} style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>
                                                    Discharge / Finish
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ====== SURGERY VIEW DETAILS MODAL ====== */}
            {viewDetailsModal.open && viewDetailsModal.surgery && (() => {
                const s = viewDetailsModal.surgery;
                const statusInfo = getStatusStyle(s.status);
                const sElapsed = s.status === 'IN_OT' ? getElapsedTime(s.actualStartTime) : null;
                const surgeonName = (s.surgeonId?.name || 'Surgeon').replace(/^Dr\.?\s*/i, '');
                const consultingDoctorName = s.doctorId?.name ? (s.doctorId?.name).replace(/^Dr\.?\s*/i, '') : null;
                const referringDoctorName = s.referringDoctorId?.name ? (s.referringDoctorId?.name).replace(/^Dr\.?\s*/i, '') : null;
                const assistants = s.assistantSurgeonIds || [];
                const cost = Number(s.surgeryCost) || 0;
                const paid = Number(s.paidAmount) || 0;
                const remaining = Math.max(0, cost - paid);

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                        <div style={{ background: '#fff', width: '100%', maxWidth: '600px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', fontWeight: 800 }}>📋 Surgery Details</h3>
                                        {s.planId && (
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '4px' }}>
                                                {s.planId}
                                            </span>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                        {s.surgeryDate 
                                            ? `Scheduled for ${new Date(s.surgeryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                                            : `Planned Preferred Date: ${new Date(s.preferredDate || s.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                                    </span>
                                </div>
                                <button onClick={() => setViewDetailsModal({ open: false, surgery: null })} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>×</button>
                            </div>

                            <div style={{ padding: '24px' }}>
                                {/* Procedure Banner */}
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px 16px', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Procedure</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#14532d' }}>{s.surgery}</div>
                                    </div>
                                    <span style={{ padding: '5px 12px', borderRadius: '16px', fontSize: '0.8rem', fontWeight: 800, background: statusInfo.bg, color: statusInfo.color, border: `1px solid ${statusInfo.border}` }}>
                                        {statusInfo.label}
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px', fontSize: '0.88rem' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>PATIENT</div>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.patientId?.name || 'Patient'}</div>
                                        <div style={{ color: '#475569', fontSize: '0.8rem' }}>MRN: {s.patientId?.mrn || s.patientId?.patientId || '-'}</div>
                                        {s.patientId?.phone && <div style={{ color: '#64748b', fontSize: '0.8rem' }}>📞 {s.patientId.phone}</div>}
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>OPERATING SURGEON (PRIMARY)</div>
                                        <div style={{ fontWeight: 700, color: '#0f172a' }}>Dr. {surgeonName}</div>
                                        {(referringDoctorName || consultingDoctorName) && (referringDoctorName !== surgeonName && consultingDoctorName !== surgeonName) && (
                                            <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>
                                                Ref: Dr. {referringDoctorName || consultingDoctorName}
                                            </div>
                                        )}
                                        {s.surgeonId?.specialization && <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Spec: {s.surgeonId.specialization}</div>}
                                    </div>

                                    {/* Surgical Assistants */}
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                                        <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>SURGICAL ASSISTANTS</div>
                                        {assistants.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {assistants.map((ast, idx) => {
                                                    const astName = typeof ast === 'object' && ast.name ? ast.name.replace(/^Dr\.?\s*/i, '') : 'Doctor';
                                                    const spec = typeof ast === 'object' && ast.specialization ? ` (${ast.specialization})` : '';
                                                    return (
                                                        <div key={idx} style={{ color: '#0f172a', fontWeight: 600, fontSize: '0.85rem' }}>
                                                            • Dr. {astName}{spec}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                None assigned
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>OT ROOM & TIMING</div>
                                        {s.otRoomId?.name ? (
                                            <>
                                                <div style={{ fontWeight: 700, color: '#0f172a' }}>🚪 {s.otRoomId.name}</div>
                                                <div style={{ color: '#334155', fontWeight: 600, fontSize: '0.82rem', marginTop: '2px' }}>
                                                    ⏰ {s.startTime || '--:--'} {s.endTime ? `- ${s.endTime}` : ''}
                                                </div>
                                            </>
                                        ) : (
                                            <div>
                                                <span style={{ color: '#b45309', fontWeight: 700, fontSize: '0.85rem' }}>⏳ OT scheduling pending</span>
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '2px' }}>CLINICAL CONTEXT</div>
                                        <div style={{ color: '#0f172a' }}><strong>Diagnosis:</strong> {s.diagnosis || 'N/A'}</div>
                                        <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '2px' }}>
                                            <strong>Priority:</strong> {s.priority || 'Normal'} | <strong>Admission Req:</strong> {s.admissionRequired ? 'Yes' : 'No'}
                                        </div>
                                    </div>
                                </div>

                                {/* Financial & Billing Status */}
                                {cost > 0 && (
                                    <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '14px 16px', borderRadius: '10px', marginBottom: '18px' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            💳 Financial & Billing Status (Collected by Reception)
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                            <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>
                                                Total Surgery Fee: <strong>₹{cost.toLocaleString('en-IN')}</strong> | Paid: <strong style={{ color: '#16a34a' }}>₹{paid.toLocaleString('en-IN')}</strong> | Remaining: <strong style={{ color: remaining > 0 ? '#dc2626' : '#16a34a' }}>₹{remaining.toLocaleString('en-IN')}</strong>
                                            </div>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: 800,
                                                background: s.paymentStatus === 'PAID' ? '#dcfce7' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fef3c7' : '#fee2e2'),
                                                color: s.paymentStatus === 'PAID' ? '#15803d' : (s.paymentStatus === 'PARTIALLY PAID' ? '#b45309' : '#b91c1c'),
                                                border: `1px solid ${s.paymentStatus === 'PAID' ? '#86efac' : (s.paymentStatus === 'PARTIALLY PAID' ? '#fde68a' : '#fca5a5')}`
                                            }}>
                                                {s.paymentStatus || 'UNPAID'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Actual Timestamps if available */}
                                {(s.actualStartTime || s.actualEndTime) && (
                                    <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                                        <div style={{ fontWeight: 700, color: '#9d174d', marginBottom: '4px' }}>⏱️ Real-time Surgery Timestamps:</div>
                                        {s.actualStartTime && <div>• Started at: <strong>{new Date(s.actualStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> {sElapsed ? `(${sElapsed} elapsed)` : ''}</div>}
                                        {s.actualEndTime && <div>• Completed at: <strong>{new Date(s.actualEndTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>}
                                    </div>
                                )}

                                {s.notes && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <div style={{ color: '#475569', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>Clinical / OT Notes:</div>
                                        <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#334155' }}>
                                            {s.notes}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                    <button onClick={() => setViewDetailsModal({ open: false, surgery: null })} style={{ padding: '9px 18px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                                        Close
                                    </button>
                                    {s.status === 'PLANNED' && (
                                        <button
                                            onClick={() => {
                                                setViewDetailsModal({ open: false, surgery: null });
                                                handleOpenScheduleModal(s);
                                            }}
                                            style={{ padding: '9px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                                        >
                                            📅 Schedule Surgery Now
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ====== SCHEDULE SURGERY MODAL (OT MANAGER BRIDGE) ====== */}
            {showScheduleModal && activePlanToSchedule && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', width: '100%', maxWidth: '540px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', fontWeight: 800 }}>
                                    📅 Schedule OT Surgery
                                </h3>
                                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                                    Plan: {activePlanToSchedule.planId || activePlanToSchedule._id}
                                </span>
                            </div>
                            <button onClick={() => setShowScheduleModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>×</button>
                        </div>

                        <form onSubmit={handleScheduleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {scheduleError && (
                                <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600 }}>
                                    ⚠️ {scheduleError}
                                </div>
                            )}

                            {/* Pre-populated Patient & Procedure Summary (Read-Only) */}
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginBottom: '2px' }}>
                                    PROCEDURE & PATIENT (AUTO-CARRIED)
                                </div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>
                                    {activePlanToSchedule.surgery}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '3px' }}>
                                    👤 <strong>{activePlanToSchedule.patientId?.name || 'Patient'}</strong> [MRN: {activePlanToSchedule.patientId?.mrn || activePlanToSchedule.patientId?.patientId || '-'}]
                                </div>
                                {activePlanToSchedule.diagnosis && (
                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                                        Diagnosis: {activePlanToSchedule.diagnosis}
                                    </div>
                                )}
                            </div>

                            {/* Operating Surgeon Selector (Single Primary) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                    Operating Surgeon (Primary) *
                                </label>
                                <select
                                    required
                                    value={scheduleForm.surgeonId}
                                    onChange={e => {
                                        const newSurgeonId = e.target.value;
                                        setScheduleForm(prev => ({
                                            ...prev,
                                            surgeonId: newSurgeonId,
                                            assistantSurgeonIds: prev.assistantSurgeonIds.filter(id => id !== newSurgeonId)
                                        }));
                                    }}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', background: '#fff' }}
                                >
                                    <option value="">-- Select Primary Operating Surgeon --</option>
                                    {doctorsList.map(doc => (
                                        <option key={doc._id} value={doc._id}>
                                            👨‍⚕️ Dr. {(doc.name || `${doc.firstName || ''} ${doc.lastName || ''}` || 'Doctor').replace(/^Dr\.?\s*/i, '')} {doc.specialization ? `(${doc.specialization})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Surgical Assistants Multi-Select */}
                            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
                                    Surgical Assistants
                                </label>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '10px' }}>
                                    Add assistant doctors supporting the primary surgeon in OT
                                </div>
                                
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                    <select
                                        value={selectedAssistantToAdd}
                                        onChange={e => setSelectedAssistantToAdd(e.target.value)}
                                        style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.88rem', color: '#0f172a', background: '#fff' }}
                                    >
                                        <option value="">-- Select Assistant Doctor --</option>
                                        {doctorsList
                                            .filter(doc => doc._id !== scheduleForm.surgeonId && !scheduleForm.assistantSurgeonIds.includes(doc._id))
                                            .map(doc => (
                                                <option key={doc._id} value={doc._id}>
                                                    👨‍⚕️ Dr. {(doc.name || `${doc.firstName || ''} ${doc.lastName || ''}` || 'Doctor').replace(/^Dr\.?\s*/i, '')} {doc.specialization ? `(${doc.specialization})` : ''}
                                                </option>
                                            ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddAssistant}
                                        disabled={!selectedAssistantToAdd}
                                        style={{ padding: '9px 14px', background: selectedAssistantToAdd ? '#2563eb' : '#94a3b8', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: selectedAssistantToAdd ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <FiPlus /> Add Assistant
                                    </button>
                                </div>

                                {scheduleForm.assistantSurgeonIds.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                                        {scheduleForm.assistantSurgeonIds.map(docId => {
                                            const docObj = doctorsList.find(d => d._id === docId);
                                            const docName = docObj ? (docObj.name || `${docObj.firstName || ''} ${docObj.lastName || ''}`).replace(/^Dr\.?\s*/i, '') : 'Doctor';
                                            return (
                                                <span key={docId} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '5px 10px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 600, color: '#1e40af' }}>
                                                    👨‍⚕️ Dr. {docName}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAssistant(docId)}
                                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', padding: 0, fontSize: '14px' }}
                                                    >
                                                        <FiX />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                        None assigned yet
                                    </div>
                                )}
                            </div>

                            {/* OT Room Selector */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                    Assign OT Room *
                                </label>
                                <select
                                    required
                                    value={scheduleForm.otRoomId}
                                    onChange={e => setScheduleForm(prev => ({ ...prev, otRoomId: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', background: '#fff' }}
                                >
                                    <option value="">-- Select OT Room --</option>
                                    {otRoomsList
                                        .filter(r => r.status !== 'Maintenance' && r.status !== 'MAINTENANCE')
                                        .map(r => (
                                            <option key={r._id} value={r._id}>
                                                🚪 {r.name} ({r.status})
                                            </option>
                                        ))}
                                </select>
                            </div>

                            {/* Surgery Date */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                    Surgery Date *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={scheduleForm.surgeryDate}
                                    onChange={e => setScheduleForm(prev => ({ ...prev, surgeryDate: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', boxSizing: 'border-box' }}
                                />
                            </div>

                            {/* Start Time & End Time */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Start Time *
                                    </label>
                                    <input
                                        type="time"
                                        required
                                        value={scheduleForm.startTime}
                                        onChange={e => setScheduleForm(prev => ({ ...prev, startTime: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        End Time *
                                    </label>
                                    <input
                                        type="time"
                                        required
                                        value={scheduleForm.endTime}
                                        onChange={e => setScheduleForm(prev => ({ ...prev, endTime: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {/* Priority & Surgery Charges */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Priority
                                    </label>
                                    <select
                                        value={scheduleForm.priority}
                                        onChange={e => setScheduleForm(prev => ({ ...prev, priority: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', background: '#fff' }}
                                    >
                                        <option value="Normal">Normal</option>
                                        <option value="High">High Priority</option>
                                        <option value="Emergency">🚨 Emergency</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Surgery Charges / Fee (₹)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="e.g. 30000"
                                        value={scheduleForm.surgeryCost}
                                        onChange={e => setScheduleForm(prev => ({ ...prev, surgeryCost: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {/* Billing notice */}
                            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', padding: '10px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiDollarSign style={{ fontSize: '1rem', flexShrink: 0 }} />
                                <span><strong>Billing Notice:</strong> Scheduling generates an <strong>UNPAID</strong> surgery charge for Reception/Billing to collect. Payment is not collected in OT.</span>
                            </div>

                            {/* Notes */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                    Clinical / OT Notes
                                </label>
                                <textarea
                                    rows="2"
                                    placeholder="Special OT instructions, anaesthesia notes, equipment requirements..."
                                    value={scheduleForm.notes}
                                    onChange={e => setScheduleForm(prev => ({ ...prev, notes: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.88rem', color: '#0f172a', boxSizing: 'border-box', resize: 'vertical' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowScheduleModal(false)}
                                    style={{ padding: '10px 18px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 600, color: '#475569', cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={scheduling}
                                    style={{ padding: '10px 24px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {scheduling ? 'Scheduling...' : '✓ Confirm & Schedule Surgery'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ====== WORKFLOW MODAL (ADMIT / TRANSFER) ====== */}
            {showWorkflowModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#fff', width: '100%', maxWidth: '440px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', fontWeight: 700 }}>
                                {workflowActionType === 'ADMIT' ? '🏥 Admit Patient' : '🔄 Transfer Bed'}
                            </h3>
                            <button onClick={() => setShowWorkflowModal(false)} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                        </div>
                        <form onSubmit={handleWorkflowModalSubmit} style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Select Available Bed *</label>
                                    <select required value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '0.92rem' }}>
                                        <option value="">-- Choose Bed --</option>
                                        {workflowBeds.map(b => <option key={b._id} value={b._id}>{b.ward} - Bed {b.bedNumber} ({b.bedType})</option>)}
                                    </select>
                                    {selectedBedId && (() => {
                                        const targetBed = workflowBeds.find(b => b._id === selectedBedId);
                                        const isIcu = (targetBed?.ward || '').toLowerCase().includes('icu');
                                        const rate = targetBed?.pricePerDay || (isIcu ? 20000 : 5000);
                                        const hourly = Math.round((rate / 24) * 100) / 100;
                                        return (
                                            <div style={{ marginTop: '10px', background: '#eff6ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#1e40af', fontWeight: 600 }}>Ward Rate:</span>
                                                <span style={{ fontSize: '0.85rem', color: '#1d4ed8', fontWeight: 800 }}>₹{rate.toLocaleString('en-IN')}/day (₹{hourly}/hr)</span>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                            <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button type="button" onClick={() => setShowWorkflowModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Confirm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OTDashboard;
