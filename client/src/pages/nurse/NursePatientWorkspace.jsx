import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    admissionAPI,
    ipdClinicalAPI,
    nursingTaskAPI,
    intakeOutputAPI,
    ipdNursingAPI,
    nursingNoteAPI
} from '../../utils/api';
import socket from '../../utils/socket';
import MedicationAdministrationModal from '../../components/nurse/MedicationAdministrationModal';
import {
    FiArrowLeft,
    FiEye,
    FiFileText,
    FiDroplet,
    FiActivity,
    FiCheckSquare,
    FiClock,
    FiRefreshCw,
    FiPlus,
    FiCheck,
    FiPause,
    FiX,
    FiAlertCircle,
    FiAlertTriangle,
    FiShield,
    FiUser,
    FiCalendar,
    FiLayers,
    FiSend,
    FiCheckCircle,
    FiMessageSquare,
    FiTag,
    FiHelpCircle
} from 'react-icons/fi';
import './NursePatientWorkspace.css';

// ── Tab definitions ──
const TABS = [
    { key: 'overview', label: 'Overview', icon: <FiEye size={15} /> },
    { key: 'orders', label: 'Doctor Orders', icon: <FiFileText size={15} /> },
    { key: 'notes', label: 'Nursing Notes', icon: <FiMessageSquare size={15} /> },
    { key: 'medications', label: 'Medications', icon: <FiDroplet size={15} /> },
    { key: 'iv_fluids', label: 'IV Fluids', icon: <FiLayers size={15} /> },
    { key: 'vitals', label: 'Vitals', icon: <FiActivity size={15} /> },
    { key: 'tasks', label: 'Tasks', icon: <FiCheckSquare size={15} /> },
    { key: 'history', label: 'History', icon: <FiClock size={15} /> },
];

const VITALS_INIT = {
    systolicBP: '',
    diastolicBP: '',
    pulse: '',
    temperature: '',
    spo2: '',
    respiratoryRate: '',
    painScore: '',
    notes: ''
};

const TASK_INIT = {
    title: '',
    description: '',
    taskType: 'MEDICATION',
    priority: 'MEDIUM'
};

const NOTE_INIT = {
    note: '',
    noteType: 'GENERAL',
    shift: 'Morning',
    priority: 'Normal'
};

const formatTime = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const NursePatientWorkspace = () => {
    const { admissionId } = useParams();
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const nurseName = user.name || 'Staff Nurse';

    const [activeTab, setActiveTab] = useState('overview');
    const [admission, setAdmission] = useState(null);
    const [orders, setOrders] = useState([]);
    const [marRecords, setMARRecords] = useState([]);
    const [vitalsHistory, setVitalsHistory] = useState([]);
    const [latestVitals, setLatestVitals] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Modal States
    const [administerModal, setAdministerModal] = useState({ open: false, record: null });
    const [vitalsModalOpen, setVitalsModalOpen] = useState(false);
    const [vitalsForm, setVitalsForm] = useState(VITALS_INIT);
    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [taskForm, setTaskForm] = useState(TASK_INIT);
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [noteForm, setNoteForm] = useState(NOTE_INIT);
    const [notesFilter, setNotesFilter] = useState('ALL');
    const [clarifyModal, setClarifyModal] = useState({ open: false, order: null, question: '' });

    // History filter
    const [historyFilter, setHistoryFilter] = useState('All');

    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);
    const toastTimeoutRef = useRef(null);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Load Complete Patient Clinical Data ──
    const fetchPatientData = useCallback(async (isManualRefresh = false) => {
        if (!admissionId) return;
        if (!isManualRefresh) setLoading(true);
        else setRefreshing(true);

        try {
            // 1. Admission details
            let adm = null;
            try {
                const singleRes = await admissionAPI.getAdmissionById(admissionId);
                adm = singleRes.admission || singleRes.data;
            } catch (err) {
                const allRes = await admissionAPI.getActiveAdmissions();
                const list = allRes.admissions || allRes.data || [];
                adm = list.find(a => String(a._id) === String(admissionId));
            }
            if (adm) setAdmission(adm);

            // 2. Doctor Orders & MAR Records & Vitals & Tasks & Notes in parallel
            const [ordersRes, marRes, vitalsRes, latestVitRes, tasksRes, notesRes] = await Promise.all([
                ipdClinicalAPI.getOrders(admissionId).catch(() => ({ orders: [] })),
                ipdClinicalAPI.getMARRecords(admissionId).catch(() => ({ marRecords: [] })),
                ipdClinicalAPI.getVitalsHistory(admissionId).catch(() => ({ vitals: [] })),
                ipdClinicalAPI.getLatestVitals(admissionId).catch(() => ({ vitals: null })),
                nursingTaskAPI.getTasks(admissionId).catch(() => ({ tasks: [] })),
                nursingNoteAPI.getNotes(admissionId).catch(() => ({ notes: [] }))
            ]);

            setOrders(ordersRes.orders || ordersRes.data || []);
            setMARRecords(marRes.marRecords || marRes.data || []);
            setVitalsHistory(vitalsRes.vitals || vitalsRes.data || []);
            setLatestVitals(latestVitRes.vitals || (vitalsRes.vitals && vitalsRes.vitals[0]) || null);
            setTasks(tasksRes.tasks || tasksRes.data || []);
            setNotes(notesRes.notes || notesRes.data || []);

            if (isManualRefresh) {
                showToast('Patient clinical workspace updated', 'success');
            }
        } catch (err) {
            console.error('Error loading patient IPD workspace data:', err);
            showToast('Error loading patient clinical records', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [admissionId, showToast]);

    useEffect(() => {
        fetchPatientData();
    }, [fetchPatientData]);

    // ── Socket.IO Real-time Events ──
    useEffect(() => {
        const hospitalId = user.hospitalId;
        if (!hospitalId) return;

        if (!socket.connected) {
            socket.connect();
            socket.emit('join_hospital', hospitalId);
        }

        const handleLiveRefresh = () => {
            fetchPatientData(true);
        };

        const events = [
            'inpatient_order_created',
            'inpatient_order_updated',
            'order_clarification_requested',
            'order_clarification_resolved',
            'mar_administered',
            'mar_scheduled',
            'vitals_recorded',
            'nursing_task_created',
            'nursing_task_updated',
            'nursing_note_created',
            'admission_updated',
            'ipd_update'
        ];

        events.forEach(evt => socket.on(evt, handleLiveRefresh));

        return () => {
            events.forEach(evt => socket.off(evt, handleLiveRefresh));
        };
    }, [user.hospitalId, fetchPatientData]);

    // ── Extract Patient Details ──
    const patientObj = useMemo(() => {
        const p = admission?.patientId || {};
        const d = admission?.doctorId || {};
        return {
            name: p.name || 'Inpatient',
            patientId: p.patientId || p.mrn || '',
            age: p.age || '',
            gender: p.gender || '',
            phone: p.phone || '',
            ward: admission?.ward || 'General',
            bedNumber: admission?.bedNumber || '—',
            admissionDate: admission?.admissionDate,
            admissionTime: admission?.admissionTime,
            attendingDoctor: d.name ? `Dr. ${d.name}` : 'Not Assigned',
            doctorSpecialization: d.specialization || '',
            status: admission?.status || 'Admitted'
        };
    }, [admission]);

    // ── Categorize Medications (Due Now, Upcoming, Overdue, Completed) ──
    const categorizedMeds = useMemo(() => {
        const now = new Date();
        const dueNow = [];
        const upcoming = [];
        const overdue = [];
        const completed = [];

        marRecords.forEach(mar => {
            const isCompleted = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'CANCELLED'].includes(mar.status);

            if (isCompleted) {
                completed.push(mar);
            } else {
                const schedTime = new Date(mar.scheduledTime).getTime();
                const diffMins = (schedTime - now.getTime()) / (1000 * 60);

                if (diffMins < -15) {
                    overdue.push(mar);
                } else if (diffMins >= -15 && diffMins <= 45) {
                    dueNow.push(mar);
                } else {
                    upcoming.push(mar);
                }
            }
        });

        // Sort by scheduled time
        dueNow.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
        upcoming.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
        overdue.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
        completed.sort((a, b) => new Date(b.administeredTime || b.updatedAt || b.scheduledTime) - new Date(a.administeredTime || a.updatedAt || a.scheduledTime));

        return { dueNow, upcoming, overdue, completed };
    }, [marRecords]);

    // ── Extract IV Fluid Orders ──
    const ivFluids = useMemo(() => {
        const list = orders.filter(o => {
            const r = (o.route || '').toLowerCase();
            const m = (o.medicineName || '').toLowerCase();
            return r.includes('iv') || r.includes('infusion') || m.includes('saline') || m.includes('dextrose') || m.includes('ringer') || m.includes('rl') || m.includes('fluid') || (o.dosageUnit || '').toLowerCase() === 'ml';
        });

        return list.map(o => {
            const vol = o.dosageValue || 1000;
            const rate = 100; // ml/hr
            const start = o.startDate ? new Date(o.startDate) : new Date(o.createdAt || Date.now());
            const hoursTotal = vol > 0 ? (vol / rate) : 8;
            const expectedEnd = new Date(start.getTime() + hoursTotal * 60 * 60 * 1000);

            // Calculate remaining volume
            const elapsedHours = Math.max(0, (Date.now() - start.getTime()) / (1000 * 60 * 60));
            const administeredMl = Math.min(vol, Math.round(elapsedHours * rate));
            const remainingMl = Math.max(0, vol - administeredMl);
            const isCompleted = remainingMl === 0 || o.status === 'COMPLETED';

            return {
                ...o,
                volume: vol,
                rate,
                start,
                startStr: formatTime(start),
                expectedEnd,
                expectedEndStr: formatTime(expectedEnd),
                remainingMl,
                administeredMl,
                progressPercent: vol > 0 ? Math.min(100, Math.round((administeredMl / vol) * 100)) : 0,
                isRunning: o.status === 'ACTIVE' && !isCompleted
            };
        });
    }, [orders]);

    // ── Build Chronological History Timeline ──
    const historyTimeline = useMemo(() => {
        const events = [];

        // 1. MAR events
        marRecords.forEach(m => {
            if (['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED'].includes(m.status)) {
                const ord = m.orderId || {};
                events.push({
                    type: 'MEDICATION',
                    title: `${ord.medicineName || 'Medication'} ${ord.dosageValue || ''}${ord.dosageUnit || ''} ${ord.route || 'IV'}`,
                    status: m.status,
                    time: m.administeredTime || m.updatedAt || m.scheduledTime,
                    actor: typeof m.administeredBy === 'object' ? m.administeredBy?.name : (m.administeredBy || 'Nurse'),
                    details: m.reason ? `Reason: ${m.reason}` : m.notes ? `Notes: ${m.notes}` : 'Administered according to schedule',
                    badge: m.status === 'ADMINISTERED' ? '✓ Administered' : m.status === 'HELD' ? '⏸ Held' : m.status === 'REFUSED' ? '✕ Refused' : '⚠ Missed'
                });
            }
        });

        // 2. Vitals events
        vitalsHistory.forEach(v => {
            const bpStr = v.systolicBP ? `BP ${v.systolicBP}/${v.diastolicBP || '—'}` : '';
            const hrStr = v.pulse ? `HR ${v.pulse} bpm` : '';
            const spStr = v.spo2 ? `SpO₂ ${v.spo2}%` : '';
            const tempStr = v.temperature ? `Temp ${v.temperature}°F` : '';

            events.push({
                type: 'VITALS',
                title: `Vitals Recorded: ${[bpStr, hrStr, spStr, tempStr].filter(Boolean).join(' • ')}`,
                status: 'RECORDED',
                time: v.recordedAt || v.createdAt,
                actor: typeof v.recordedBy === 'object' ? v.recordedBy?.name : 'Nurse',
                details: v.notes ? `Notes: ${v.notes}` : 'Routine clinical vitals check',
                badge: 'Vitals'
            });
        });

        // 3. Doctor Orders events
        orders.forEach(o => {
            events.push({
                type: 'DOCTOR_ORDER',
                title: `Doctor Order: ${o.medicineName} (${o.dosageValue || ''}${o.dosageUnit || ''} ${o.route || 'Oral'} — ${o.frequency || 'OD'})`,
                status: o.status,
                time: o.createdAt || o.startDate,
                actor: typeof o.doctorId === 'object' ? `Dr. ${o.doctorId?.name}` : 'Doctor',
                details: o.instructions ? `Instructions: ${o.instructions}` : `Duration: ${o.duration || '3 days'}`,
                badge: 'Doctor Order'
            });
        });

        // 4. Tasks events
        tasks.forEach(t => {
            if (t.status === 'COMPLETED') {
                events.push({
                    type: 'TASK',
                    title: `Nursing Task Completed: ${t.title}`,
                    status: 'COMPLETED',
                    time: t.completedAt || t.updatedAt,
                    actor: typeof t.assignedNurseId === 'object' ? t.assignedNurseId?.name : 'Nurse',
                    details: t.description || 'Task completed successfully',
                    badge: 'Task Done'
                });
            }
        });

        // Sort descending by timestamp
        events.sort((a, b) => new Date(b.time) - new Date(a.time));

        if (historyFilter === 'All') return events;
        if (historyFilter === 'Medications') return events.filter(e => e.type === 'MEDICATION');
        if (historyFilter === 'IV Fluids') return events.filter(e => e.type === 'IV_FLUID' || (e.type === 'MEDICATION' && e.title.toLowerCase().includes('iv')));
        if (historyFilter === 'Vitals') return events.filter(e => e.type === 'VITALS');
        if (historyFilter === 'Tasks') return events.filter(e => e.type === 'TASK');
        if (historyFilter === 'Doctor Orders') return events.filter(e => e.type === 'DOCTOR_ORDER');

        return events;
    }, [marRecords, vitalsHistory, orders, tasks, historyFilter]);

    // ── Administration Modal Handler ──
    const handleConfirmAdministration = async (adminPayload) => {
        try {
            await ipdClinicalAPI.updateMARRecord(adminPayload.marId, {
                status: adminPayload.status,
                actualDoseValue: adminPayload.actualDoseValue,
                actualDoseUnit: adminPayload.actualDoseUnit,
                notes: adminPayload.notes,
                reason: adminPayload.reason
            });
            showToast(`Medication successfully marked as ${adminPayload.status}`, 'success');
            fetchPatientData(true);
        } catch (err) {
            console.error('Error confirming administration:', err);
            throw new Error(err.response?.data?.message || err.message || 'Failed to update administration record.');
        }
    };

    // ── Record Vitals Handler ──
    const handleRecordVitalsSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await ipdClinicalAPI.recordVitals(admissionId, {
                systolicBP: vitalsForm.systolicBP ? Number(vitalsForm.systolicBP) : undefined,
                diastolicBP: vitalsForm.diastolicBP ? Number(vitalsForm.diastolicBP) : undefined,
                pulse: vitalsForm.pulse ? Number(vitalsForm.pulse) : undefined,
                temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : undefined,
                spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : undefined,
                respiratoryRate: vitalsForm.respiratoryRate ? Number(vitalsForm.respiratoryRate) : undefined,
                painScore: vitalsForm.painScore ? Number(vitalsForm.painScore) : undefined,
                notes: vitalsForm.notes.trim()
            });
            showToast('Patient vitals recorded successfully', 'success');
            setVitalsModalOpen(false);
            setVitalsForm(VITALS_INIT);
            fetchPatientData(true);
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to record vitals', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Create Task Handler ──
    const handleCreateTaskSubmit = async (e) => {
        e.preventDefault();
        if (!taskForm.title.trim()) return;
        setSubmitting(true);
        try {
            await nursingTaskAPI.createTask({
                admissionId,
                patientId: patientObj.patientId,
                title: taskForm.title.trim(),
                description: taskForm.description.trim(),
                taskType: taskForm.taskType,
                priority: taskForm.priority,
                scheduledAt: new Date()
            });
            showToast('Nursing task created', 'success');
            setTaskModalOpen(false);
            setTaskForm(TASK_INIT);
            fetchPatientData(true);
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to create task', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Toggle Task Status ──
    const handleUpdateTaskStatus = async (taskId, newStatus) => {
        try {
            await nursingTaskAPI.updateTask(taskId, { status: newStatus });
            showToast(`Task marked as ${newStatus.toLowerCase()}`, 'success');
            fetchPatientData(true);
        } catch (err) {
            showToast('Failed to update task', 'error');
        }
    };

    // ── Nursing Note Handler ──
    const handleRecordNoteSubmit = async (e) => {
        if (e) e.preventDefault();
        if (!noteForm.note.trim()) {
            showToast('Note text cannot be empty', 'error');
            return;
        }
        setSubmitting(true);
        try {
            const res = await nursingNoteAPI.createNote(admissionId, {
                note: noteForm.note.trim(),
                noteType: noteForm.noteType || 'GENERAL',
                shift: noteForm.shift || 'Morning',
                priority: noteForm.priority || 'Normal'
            });
            if (res.success || res.note || res.data) {
                showToast('Nursing note recorded successfully', 'success');
                setNoteModalOpen(false);
                setNoteForm(NOTE_INIT);
                fetchPatientData(true);
            } else {
                throw new Error(res.message || 'Failed to record nursing note');
            }
        } catch (err) {
            console.error('Failed to submit nursing note:', err);
            showToast(err.response?.data?.message || err.message || 'Failed to save nursing note', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Clarification Handler ──
    const handleSendClarification = async (e) => {
        e.preventDefault();
        if (!clarifyModal.order || !clarifyModal.question.trim()) return;
        setSubmitting(true);
        try {
            await ipdClinicalAPI.requestClarification(admissionId, clarifyModal.order._id, {
                question: clarifyModal.question.trim(),
                issueType: 'DOSE_QUERY'
            });
            showToast('Clarification sent to prescribing doctor', 'success');
            setClarifyModal({ open: false, order: null, question: '' });
            fetchPatientData(true);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Failed to send clarification', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="npw-container">
            {/* ── Toast Notification ── */}
            {toast && (
                <div className={`npw-toast ${toast.type}`}>
                    <span>{toast.message}</span>
                </div>
            )}

            {/* ── Header: Patient IPD Care Banner ── */}
            <div className="npw-header">
                <div className="npw-header-nav">
                    <button className="npw-back-btn" onClick={() => navigate('/nurse/dashboard')}>
                        <FiArrowLeft size={16} /> Back to IPD Patients
                    </button>
                    <div className="npw-header-actions">
                        <button
                            className="npw-btn-outline"
                            onClick={() => fetchPatientData(true)}
                            disabled={refreshing || loading}
                        >
                            <FiRefreshCw size={13} className={refreshing ? 'spinning' : ''} /> Refresh Live
                        </button>
                        <button
                            className="npw-btn-outline"
                            onClick={() => setNoteModalOpen(true)}
                        >
                            <FiPlus size={14} /> Add Note
                        </button>
                        <button
                            className="npw-btn-primary"
                            onClick={() => setVitalsModalOpen(true)}
                        >
                            <FiPlus size={14} /> Record Vitals
                        </button>
                    </div>
                </div>

                {/* Patient Primary Info Card */}
                <div className="npw-patient-card">
                    <div className="npw-pt-main">
                        <div className="npw-pt-avatar">
                            {patientObj.name ? patientObj.name.slice(0, 2).toUpperCase() : 'PT'}
                        </div>
                        <div className="npw-pt-details">
                            <div className="npw-pt-name-row">
                                <h1>{patientObj.name}</h1>
                                <span className="npw-status-badge admitted">● {patientObj.status}</span>
                            </div>
                            <div className="npw-pt-meta-pills">
                                {patientObj.age && <span>{patientObj.age} Years / {patientObj.gender}</span>}
                                {patientObj.patientId && <span className="npw-mrn-badge">MRN: {patientObj.patientId}</span>}
                                <span className="npw-bed-badge">{patientObj.ward} • Bed {patientObj.bedNumber}</span>
                            </div>
                        </div>
                    </div>

                    <div className="npw-pt-clinical-meta">
                        <div className="npw-meta-box">
                            <span className="npw-meta-lbl">Attending Doctor</span>
                            <span className="npw-meta-val">{patientObj.attendingDoctor}</span>
                        </div>
                        <div className="npw-meta-box">
                            <span className="npw-meta-lbl">Admission Date</span>
                            <span className="npw-meta-val">{formatDate(patientObj.admissionDate)} {patientObj.admissionTime ? `• ${patientObj.admissionTime}` : ''}</span>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="npw-tabs-nav">
                    {TABS.map(tab => (
                        <button
                            key={tab.key}
                            className={`npw-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {tab.key === 'medications' && categorizedMeds.dueNow.length > 0 && (
                                <span className="npw-tab-badge due">{categorizedMeds.dueNow.length}</span>
                            )}
                            {tab.key === 'medications' && categorizedMeds.overdue.length > 0 && (
                                <span className="npw-tab-badge overdue">{categorizedMeds.overdue.length}</span>
                            )}
                            {tab.key === 'orders' && orders.length > 0 && (
                                <span className="npw-tab-badge count">{orders.length}</span>
                            )}
                            {tab.key === 'notes' && notes.length > 0 && (
                                <span className="npw-tab-badge count">{notes.length}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Tab Content ── */}
            <div className="npw-tab-content">
                {loading ? (
                    <div className="npw-loading-view">
                        <div className="npw-spinner" />
                        <p>Loading patient clinical workspace...</p>
                    </div>
                ) : (
                    <>
                        {/* ══════════════════════════════════════════════════════════
                            TAB 1: OVERVIEW
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'overview' && (
                            <div className="npw-overview-grid">
                                {/* Treatment Summary Highlights */}
                                <div className="npw-card npw-summary-highlights">
                                    <h3>Current Treatment Summary</h3>
                                    <div className="npw-highlights-row">
                                        <div className="npw-highlight-box blue">
                                            <span className="npw-h-val">{orders.filter(o => o.status === 'ACTIVE').length}</span>
                                            <span className="npw-h-lbl">Active Medicines</span>
                                        </div>
                                        <div className="npw-highlight-box teal">
                                            <span className="npw-h-val">{ivFluids.filter(i => i.isRunning).length}</span>
                                            <span className="npw-h-lbl">IV Fluids Running</span>
                                        </div>
                                        <div className="npw-highlight-box amber">
                                            <span className="npw-h-val">
                                                {categorizedMeds.dueNow.length > 0
                                                    ? formatTime(categorizedMeds.dueNow[0].scheduledTime)
                                                     : categorizedMeds.upcoming.length > 0
                                                    ? formatTime(categorizedMeds.upcoming[0].scheduledTime)
                                                    : 'None'}
                                            </span>
                                            <span className="npw-h-lbl">Next Medication</span>
                                        </div>
                                        <div className="npw-highlight-box purple">
                                            <span className="npw-h-val">{tasks.filter(t => t.status === 'PENDING').length}</span>
                                            <span className="npw-h-lbl">Pending Tasks</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Clinical Diagnosis & Doctor Notes */}
                                <div className="npw-card">
                                    <div className="npw-card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <h3 style={{ margin: 0 }}>Clinical Diagnosis & Doctor Notes</h3>
                                        <button className="npw-link-btn" onClick={() => setActiveTab('orders')}>
                                            View Orders ({orders.length}) →
                                        </button>
                                    </div>
                                    <div className="npw-diagnosis-body">
                                        <div className="npw-diag-row">
                                            <strong>Primary Diagnosis / Reason:</strong>
                                            <p>{admission?.reasonForAdmission || admission?.diagnosis || orders[0]?.diagnosis || orders[0]?.admissionReason || 'Inpatient Clinical Care & Observation'}</p>
                                        </div>
                                        {admission?.notes && (
                                            <div className="npw-diag-row notes" style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #0284c7', marginTop: '8px' }}>
                                                <strong>Admission Doctor Note:</strong>
                                                <p style={{ margin: '4px 0 0 0', color: '#1e293b' }}>{admission.notes}</p>
                                            </div>
                                        )}
                                        {orders.filter(o => o.clinicalNotes).map((o, idx) => (
                                            <div key={o._id || idx} className="npw-diag-row notes" style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: '8px', borderLeft: '3px solid #3b82f6', marginTop: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1d4ed8', fontWeight: 600, marginBottom: '2px' }}>
                                                    <span>Doctor Advice ({o.medicineName || 'Clinical Order'}):</span>
                                                    <span>{typeof o.doctorId === 'object' ? `Dr. ${o.doctorId?.name}` : ''}</span>
                                                </div>
                                                <p style={{ margin: 0, color: '#1e3a8a', whiteSpace: 'pre-wrap' }}>{o.clinicalNotes}</p>
                                                {o.instructions && (
                                                    <div style={{ fontSize: '12px', color: '#2563eb', marginTop: '4px', fontStyle: 'italic' }}>
                                                        Instructions: {o.instructions}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Latest Nursing Notes Snapshot */}
                                <div className="npw-card">
                                    <div className="npw-card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <h3 style={{ margin: 0 }}>Nursing Notes Feed ({notes.length})</h3>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className="npw-link-btn" onClick={() => setNoteModalOpen(true)}>
                                                + Add Note
                                            </button>
                                            <button className="npw-link-btn" onClick={() => setActiveTab('notes')}>
                                                View All →
                                            </button>
                                        </div>
                                    </div>
                                    {notes.length === 0 ? (
                                        <div className="npw-empty-section">
                                            <p>No nursing notes recorded yet for this admission.</p>
                                            <button className="npw-btn-primary small" onClick={() => setNoteModalOpen(true)}>
                                                Record First Nursing Note
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {notes.slice(0, 3).map(n => {
                                                const nurseObj = typeof n.nurseId === 'object' ? n.nurseId : {};
                                                return (
                                                    <div key={n._id} style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', borderLeft: n.priority === 'Urgent' ? '3px solid #ef4444' : n.priority === 'High' ? '3px solid #f59e0b' : '3px solid #0284c7' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>{nurseObj.name || 'Nurse'} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>({n.shift || 'Shift'})</span></strong>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <span className="npw-pill-badge type" style={{ fontSize: '10px', padding: '1px 6px' }}>{n.noteType || 'GENERAL'}</span>
                                                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{formatTime(n.createdAt)}</span>
                                                            </div>
                                                        </div>
                                                        <p style={{ margin: 0, fontSize: '13px', color: '#334155', whiteSpace: 'pre-wrap' }}>{n.note}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Recent Vitals Snapshot */}
                                <div className="npw-card">
                                    <div className="npw-card-header-row">
                                        <h3>Recent Vitals</h3>
                                        <button className="npw-link-btn" onClick={() => setVitalsModalOpen(true)}>
                                            + Record Vitals
                                        </button>
                                    </div>
                                    {latestVitals ? (
                                        <div className="npw-vitals-grid-cards">
                                            <div className="npw-vital-box">
                                                <span className="npw-v-lbl">Blood Pressure</span>
                                                <span className="npw-v-val">{latestVitals.systolicBP ? `${latestVitals.systolicBP}/${latestVitals.diastolicBP || '—'}` : '—'}</span>
                                                <span className="npw-v-unit">mmHg</span>
                                            </div>
                                            <div className="npw-vital-box">
                                                <span className="npw-v-lbl">Pulse (Heart Rate)</span>
                                                <span className="npw-v-val">{latestVitals.pulse || '—'}</span>
                                                <span className="npw-v-unit">bpm</span>
                                            </div>
                                            <div className="npw-vital-box">
                                                <span className="npw-v-lbl">Oxygen Saturation (SpO₂)</span>
                                                <span className={`npw-v-val ${(latestVitals.spo2 && latestVitals.spo2 < 95) ? 'alert' : ''}`}>
                                                    {latestVitals.spo2 ? `${latestVitals.spo2}%` : '—'}
                                                </span>
                                                <span className="npw-v-unit">SpO₂</span>
                                            </div>
                                            <div className="npw-vital-box">
                                                <span className="npw-v-lbl">Temperature</span>
                                                <span className="npw-v-val">{latestVitals.temperature ? `${latestVitals.temperature}°F` : '—'}</span>
                                                <span className="npw-v-unit">°F</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="npw-empty-section">
                                            <p>No vitals recorded yet today.</p>
                                            <button className="npw-btn-primary small" onClick={() => setVitalsModalOpen(true)}>
                                                Record First Vitals
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 2: DOCTOR ORDERS
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'orders' && (
                            <div className="npw-orders-view">
                                <div className="npw-orders-header">
                                    <div>
                                        <h2>DOCTOR ORDERS & CLINICAL NOTES</h2>
                                        <p className="npw-sub-info">Direct clinical IPD orders and physician instructions for this admission.</p>
                                    </div>
                                    <span className="npw-badge-count">{orders.length} Active Orders</span>
                                </div>

                                {orders.length === 0 ? (
                                    <div className="npw-empty-state">
                                        <div className="npw-empty-icon">📋</div>
                                        <h3>No doctor orders recorded</h3>
                                        <p>No IPD treatment orders have been placed for this admission yet.</p>
                                    </div>
                                ) : (
                                    <div className="npw-orders-list">
                                        {orders.map(order => {
                                            const docName = typeof order.doctorId === 'object' ? order.doctorId?.name : order.doctorId;
                                            return (
                                                <div className="npw-order-card" key={order._id}>
                                                    <div className="npw-order-top">
                                                        <div className="npw-order-title-block">
                                                            <div className="npw-order-med">{order.medicineName}</div>
                                                            <div className="npw-order-specs">
                                                                <span className="npw-spec-pill dose">{order.dosageValue} {order.dosageUnit || 'mg'}</span>
                                                                <span className="npw-spec-pill route">{order.route || 'Oral'}</span>
                                                                <span className="npw-spec-pill freq">{order.frequency || 'OD'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="npw-order-status-block">
                                                            <span className={`npw-order-status ${order.status.toLowerCase()}`}>
                                                                {order.status}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="npw-order-details-grid">
                                                        <div className="npw-order-dt">
                                                            <span className="npw-lbl">Ordered By:</span>
                                                            <strong>Dr. {docName || 'Attending Physician'}</strong>
                                                            <span className="npw-date-sub">{formatDate(order.createdAt)} • {formatTime(order.createdAt)}</span>
                                                        </div>
                                                        <div className="npw-order-dt">
                                                            <span className="npw-lbl">Start Schedule:</span>
                                                            <span>{formatDate(order.startDate)}</span>
                                                        </div>
                                                        <div className="npw-order-dt">
                                                            <span className="npw-lbl">Duration:</span>
                                                            <span>{order.duration || 'Continuous'}</span>
                                                        </div>
                                                        {order.instructions && (
                                                            <div className="npw-order-dt full">
                                                                <span className="npw-lbl">Instructions:</span>
                                                                <em>{order.instructions}</em>
                                                            </div>
                                                        )}
                                                        {order.clinicalNotes && (
                                                            <div className="npw-order-dt full" style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                                                <span className="npw-lbl" style={{ color: '#166534', fontWeight: 700 }}>Doctor Clinical Notes & Advice:</span>
                                                                <div style={{ color: '#14532d', fontSize: '13px', marginTop: '3px', whiteSpace: 'pre-wrap' }}>
                                                                    {order.clinicalNotes}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Doctor ↔ Nurse Clarification Communication Thread */}
                                                    {order.clarifications && order.clarifications.length > 0 && (
                                                        <div className="npw-order-clarifications-thread">
                                                            <div className="npw-clarify-thread-header">
                                                                <FiHelpCircle size={14} className="clarify-icon" />
                                                                <span>Doctor ↔ Nurse Clarification & Orders Query ({order.clarifications.length})</span>
                                                            </div>
                                                            <div className="npw-clarify-items-list">
                                                                {order.clarifications.map((clar, cIdx) => {
                                                                    const isResolved = clar.status === 'RESOLVED';
                                                                    return (
                                                                        <div key={clar._id || cIdx} className={`npw-clarify-card ${isResolved ? 'resolved' : 'pending'}`}>
                                                                            {/* Nurse Query */}
                                                                            <div className="npw-clarify-question-box">
                                                                                <div className="npw-clarify-meta-row">
                                                                                    <span className="npw-clarify-nurse-tag">
                                                                                        👩‍⚕️ Nurse {clar.requestedByName || 'Staff Nurse'}
                                                                                    </span>
                                                                                    <span className="npw-clarify-type-pill">{clar.issueType || 'DOSE_QUERY'}</span>
                                                                                    <span className="npw-clarify-timestamp">
                                                                                        {formatDate(clar.requestedAt || clar.createdAt)} • {formatTime(clar.requestedAt || clar.createdAt)}
                                                                                    </span>
                                                                                </div>
                                                                                <p className="npw-clarify-q-text">{clar.question}</p>
                                                                            </div>

                                                                            {/* Doctor Response / Instruction */}
                                                                            {clar.responseText ? (
                                                                                <div className="npw-clarify-response-box">
                                                                                    <div className="npw-clarify-meta-row">
                                                                                        <span className="npw-clarify-doc-tag">
                                                                                            <FiCheckCircle size={13} color="#16a34a" /> Dr. Response / Instruction:
                                                                                        </span>
                                                                                        <span className="npw-clarify-timestamp">
                                                                                            {clar.respondedAt ? `${formatDate(clar.respondedAt)} • ${formatTime(clar.respondedAt)}` : ''}
                                                                                        </span>
                                                                                        <span className="npw-badge-resolved">✓ RESOLVED</span>
                                                                                    </div>
                                                                                    <div className="npw-clarify-ans-text">
                                                                                        {clar.responseText}
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="npw-clarify-pending-box">
                                                                                    <FiClock size={13} />
                                                                                    <span>Awaiting instruction / response from prescribing doctor...</span>
                                                                                    <span className="npw-badge-pending-doc">ACTION PENDING WITH DOCTOR</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="npw-order-actions">
                                                        <button
                                                            className="npw-clarify-btn"
                                                            onClick={() => setClarifyModal({ open: true, order, question: '' })}
                                                        >
                                                            <FiAlertCircle size={13} /> Clarify with Doctor
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 3: NURSING NOTES (Clinical Shift Notes)
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'notes' && (
                            <div className="npw-notes-view">
                                <div className="npw-notes-header">
                                    <div>
                                        <h2>NURSING CLINICAL NOTES & OBSERVATIONS</h2>
                                        <p className="npw-sub-info" style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                                            Record shift assessments, patient conditions, wound checks, and bedside observations.
                                        </p>
                                    </div>
                                    <button className="npw-btn-primary" onClick={() => setNoteModalOpen(true)}>
                                        <FiPlus size={14} /> New Nursing Note
                                    </button>
                                </div>

                                {/* Quick Note Inline Composer */}
                                <div className="npw-notes-composer-card">
                                    <h3><FiMessageSquare size={16} color="#0284c7" /> Quick Record Nursing Note</h3>
                                    <form onSubmit={handleRecordNoteSubmit}>
                                        <div className="npw-notes-form-row">
                                            <div className="npw-form-group">
                                                <label>Note Category</label>
                                                <select
                                                    value={noteForm.noteType}
                                                    onChange={e => setNoteForm({ ...noteForm, noteType: e.target.value })}
                                                >
                                                    <option value="GENERAL">General Care Note</option>
                                                    <option value="PATIENT_CONDITION">Patient Condition</option>
                                                    <option value="OBSERVATION">Clinical Observation</option>
                                                    <option value="MEDICATION">Medication Assessment</option>
                                                    <option value="POST_OP">Post-Op Recovery</option>
                                                    <option value="WOUND">Wound & Dressing</option>
                                                    <option value="SAFETY">Safety & Fall Risk</option>
                                                    <option value="OTHER">Other Bedside Note</option>
                                                </select>
                                            </div>
                                            <div className="npw-form-group">
                                                <label>Nursing Shift</label>
                                                <select
                                                    value={noteForm.shift}
                                                    onChange={e => setNoteForm({ ...noteForm, shift: e.target.value })}
                                                >
                                                    <option value="Morning">Morning Shift (07:00 - 15:00)</option>
                                                    <option value="Evening">Evening Shift (15:00 - 23:00)</option>
                                                    <option value="Night">Night Shift (23:00 - 07:00)</option>
                                                </select>
                                            </div>
                                            <div className="npw-form-group">
                                                <label>Priority</label>
                                                <select
                                                    value={noteForm.priority}
                                                    onChange={e => setNoteForm({ ...noteForm, priority: e.target.value })}
                                                >
                                                    <option value="Normal">Normal</option>
                                                    <option value="High">High Attention</option>
                                                    <option value="Urgent">Urgent / Critical</option>
                                                </select>
                                            </div>
                                            <div className="npw-form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                <button
                                                    type="submit"
                                                    className="npw-btn-primary"
                                                    disabled={submitting || !noteForm.note.trim()}
                                                    style={{ height: '38px' }}
                                                >
                                                    {submitting ? 'Saving...' : 'Post Note'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="npw-form-group full" style={{ margin: 0 }}>
                                            <textarea
                                                rows={3}
                                                placeholder="Write detailed clinical observation, vitals correlation, fluid balance status, patient complaints, or bedside nursing actions..."
                                                value={noteForm.note}
                                                onChange={e => setNoteForm({ ...noteForm, note: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </form>
                                </div>

                                {/* Notes Filter & Feed */}
                                <div className="npw-notes-list">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <h3 style={{ fontSize: '14.5px', fontWeight: 700, margin: 0, color: '#334155' }}>
                                            Chronological Nursing Feed ({notes.length})
                                        </h3>
                                    </div>

                                    {notes.length === 0 ? (
                                        <div className="npw-empty-state">
                                            <div className="npw-empty-icon">📝</div>
                                            <h3>No nursing notes recorded</h3>
                                            <p>Use the composer above to write the first nursing shift note for this patient.</p>
                                        </div>
                                    ) : (
                                        notes.map(n => {
                                            const nurseObj = typeof n.nurseId === 'object' ? n.nurseId : {};
                                            const nurseInitials = nurseObj.name ? nurseObj.name.slice(0, 2).toUpperCase() : 'NS';
                                            const prioClass = (n.priority || 'Normal').toLowerCase();

                                            return (
                                                <div key={n._id} className={`npw-note-card priority-${prioClass}`}>
                                                    <div className="npw-note-card-top">
                                                        <div className="npw-note-author-info">
                                                            <div className="npw-note-avatar">{nurseInitials}</div>
                                                            <div>
                                                                <div className="npw-note-author-name">
                                                                    {nurseObj.name || 'Staff Nurse'}
                                                                    {nurseObj.role && <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 400, marginLeft: '6px' }}>({nurseObj.role})</span>}
                                                                </div>
                                                                <div className="npw-note-timestamp">
                                                                    {formatDate(n.createdAt)} at {formatTime(n.createdAt)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="npw-note-badges">
                                                            <span className="npw-pill-badge type">{n.noteType || 'GENERAL'}</span>
                                                            <span className="npw-pill-badge shift">{n.shift || 'Shift'}</span>
                                                            {n.priority && n.priority !== 'Normal' && (
                                                                <span className={`npw-pill-badge priority-${prioClass}`}>{n.priority}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="npw-note-content">
                                                        {n.note}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 3: MEDICATIONS (Main Working Screen)
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'medications' && (
                            <div className="npw-medications-view">
                                {/* Compact Daily Timeline */}
                                <div className="npw-meds-timeline-card">
                                    <h3>Today's Medication Schedule</h3>
                                    <div className="npw-timeline-scroll">
                                        {marRecords.length === 0 ? (
                                            <p className="npw-muted">No scheduled medication doses for today.</p>
                                        ) : (
                                            <div className="npw-timeline-chips">
                                                {marRecords.map(mar => {
                                                    const ord = mar.orderId || {};
                                                    const isDone = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED'].includes(mar.status);
                                                    return (
                                                        <div
                                                            key={mar._id}
                                                            className={`npw-timeline-chip ${mar.status.toLowerCase()}`}
                                                            onClick={() => !isDone && setAdministerModal({ open: true, record: mar })}
                                                        >
                                                            <span className="npw-chip-time">{formatTime(mar.scheduledTime)}</span>
                                                            <span className="npw-chip-name">{ord.medicineName || 'Med'}</span>
                                                            <span className="npw-chip-status">
                                                                {mar.status === 'ADMINISTERED' ? '✓' : mar.status === 'HELD' ? '⏸' : mar.status === 'REFUSED' ? '✕' : mar.status === 'MISSED' ? '⚠' : '●'}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* SECTION: OVERDUE */}
                                {categorizedMeds.overdue.length > 0 && (
                                    <div className="npw-med-group overdue-section">
                                        <div className="npw-group-header red">
                                            <FiAlertTriangle size={16} />
                                            <h4>OVERDUE MEDICATIONS ({categorizedMeds.overdue.length})</h4>
                                        </div>
                                        <div className="npw-med-cards-list">
                                            {categorizedMeds.overdue.map(mar => {
                                                const ord = mar.orderId || {};
                                                return (
                                                    <div className="npw-mar-card overdue" key={mar._id}>
                                                        <div className="npw-mar-time-col">
                                                            <span className="npw-time-huge">{formatTime(mar.scheduledTime)}</span>
                                                            <span className="npw-overdue-tag">Needs Attention</span>
                                                        </div>
                                                        <div className="npw-mar-info-col">
                                                            <div className="npw-mar-med-name">{ord.medicineName} {ord.dosageValue} {ord.dosageUnit || 'mg'}</div>
                                                            <div className="npw-mar-meta">
                                                                <span className="npw-spec-pill route">{ord.route || 'Oral'}</span>
                                                                <span>• Bed {patientObj.bedNumber} ({patientObj.ward})</span>
                                                            </div>
                                                        </div>
                                                        <div className="npw-mar-action-col">
                                                            <button
                                                                className="npw-administer-btn alert"
                                                                onClick={() => setAdministerModal({ open: true, record: mar })}
                                                            >
                                                                Administer Now
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* SECTION: DUE NOW */}
                                <div className="npw-med-group due-section">
                                    <div className="npw-group-header amber">
                                        <FiClock size={16} />
                                        <h4>DUE NOW ({categorizedMeds.dueNow.length})</h4>
                                    </div>
                                    {categorizedMeds.dueNow.length === 0 ? (
                                        <div className="npw-group-empty">No medications currently due right now.</div>
                                    ) : (
                                        <div className="npw-med-cards-list">
                                            {categorizedMeds.dueNow.map(mar => {
                                                const ord = mar.orderId || {};
                                                return (
                                                    <div className="npw-mar-card due" key={mar._id}>
                                                        <div className="npw-mar-time-col">
                                                            <span className="npw-time-huge">{formatTime(mar.scheduledTime)}</span>
                                                            <span className="npw-due-pulse-tag">● Due Now</span>
                                                        </div>
                                                        <div className="npw-mar-info-col">
                                                            <div className="npw-mar-med-name">{ord.medicineName} {ord.dosageValue} {ord.dosageUnit || 'mg'}</div>
                                                            <div className="npw-mar-meta">
                                                                <span className="npw-spec-pill route">{ord.route || 'Oral'}</span>
                                                                <span>• Bed {patientObj.bedNumber}</span>
                                                            </div>
                                                        </div>
                                                        <div className="npw-mar-action-col">
                                                            <button
                                                                className="npw-administer-btn"
                                                                onClick={() => setAdministerModal({ open: true, record: mar })}
                                                            >
                                                                Administer
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* SECTION: UPCOMING */}
                                <div className="npw-med-group upcoming-section">
                                    <div className="npw-group-header blue">
                                        <FiCalendar size={16} />
                                        <h4>UPCOMING TODAY ({categorizedMeds.upcoming.length})</h4>
                                    </div>
                                    {categorizedMeds.upcoming.length === 0 ? (
                                        <div className="npw-group-empty">No upcoming medications for the rest of today.</div>
                                    ) : (
                                        <div className="npw-med-cards-list">
                                            {categorizedMeds.upcoming.map(mar => {
                                                const ord = mar.orderId || {};
                                                return (
                                                    <div className="npw-mar-card upcoming" key={mar._id}>
                                                        <div className="npw-mar-time-col">
                                                            <span className="npw-time-huge">{formatTime(mar.scheduledTime)}</span>
                                                            <span className="npw-upcoming-tag">Scheduled</span>
                                                        </div>
                                                        <div className="npw-mar-info-col">
                                                            <div className="npw-mar-med-name">{ord.medicineName} {ord.dosageValue} {ord.dosageUnit || 'mg'}</div>
                                                            <div className="npw-mar-meta">
                                                                <span className="npw-spec-pill route">{ord.route || 'Oral'}</span>
                                                                <span>• {ord.frequency || 'OD'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="npw-mar-action-col">
                                                            <button
                                                                className="npw-btn-outline small"
                                                                onClick={() => setAdministerModal({ open: true, record: mar })}
                                                            >
                                                                Administer Early
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* SECTION: COMPLETED TODAY */}
                                <div className="npw-med-group completed-section">
                                    <div className="npw-group-header green">
                                        <FiCheckCircle size={16} />
                                        <h4>COMPLETED / RECORDED TODAY ({categorizedMeds.completed.length})</h4>
                                    </div>
                                    {categorizedMeds.completed.length === 0 ? (
                                        <div className="npw-group-empty">No medications administered or recorded yet today.</div>
                                    ) : (
                                        <div className="npw-med-cards-list">
                                            {categorizedMeds.completed.map(mar => {
                                                const ord = mar.orderId || {};
                                                const adminNurse = typeof mar.administeredBy === 'object' ? mar.administeredBy?.name : (mar.administeredBy || 'Staff Nurse');
                                                return (
                                                    <div className="npw-mar-card completed" key={mar._id}>
                                                        <div className="npw-mar-time-col">
                                                            <span className="npw-time-huge">{formatTime(mar.administeredTime || mar.scheduledTime)}</span>
                                                            <span className={`npw-status-pill-small ${mar.status.toLowerCase()}`}>
                                                                {mar.status}
                                                            </span>
                                                        </div>
                                                        <div className="npw-mar-info-col">
                                                            <div className="npw-mar-med-name">{ord.medicineName} {ord.dosageValue} {ord.dosageUnit || 'mg'} ({ord.route || 'Oral'})</div>
                                                            <div className="npw-mar-meta">
                                                                <span>Nurse: <strong>{adminNurse}</strong></span>
                                                                {mar.reason && <span className="npw-reason-text">• Reason: {mar.reason}</span>}
                                                                {mar.notes && <span className="npw-notes-text">• {mar.notes}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 4: IV FLUIDS
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'iv_fluids' && (
                            <div className="npw-iv-view">
                                <div className="npw-iv-header">
                                    <div>
                                        <h2>IV FLUID / DRIP MANAGEMENT</h2>
                                        <p className="npw-sub-info">Track running IV infusions, rates, volumes and completion timelines.</p>
                                    </div>
                                </div>

                                {ivFluids.length === 0 ? (
                                    <div className="npw-empty-state">
                                        <div className="npw-empty-icon">💧</div>
                                        <h3>No active IV fluids</h3>
                                        <p>No active IV infusion or drip orders for this patient.</p>
                                    </div>
                                ) : (
                                    <div className="npw-iv-cards-list">
                                        {ivFluids.map(iv => {
                                            const docName = typeof iv.doctorId === 'object' ? iv.doctorId?.name : iv.doctorId;
                                            return (
                                                <div className="npw-iv-card" key={iv._id}>
                                                    <div className="npw-iv-card-top">
                                                        <div className="npw-iv-title-wrap">
                                                            <div className="npw-iv-name">{iv.medicineName}</div>
                                                            <span className="npw-iv-status-tag running">
                                                                <span className="nipd-pulse-dot" /> Running
                                                            </span>
                                                        </div>
                                                        <div className="npw-iv-specs-pill">
                                                            {iv.volume} ml @ {iv.rate} ml/hr
                                                        </div>
                                                    </div>

                                                    {/* Progress bar */}
                                                    <div className="npw-iv-progress-wrap">
                                                        <div className="npw-iv-progress-bar">
                                                            <div
                                                                className="npw-iv-progress-fill"
                                                                style={{ width: `${iv.progressPercent}%` }}
                                                            />
                                                        </div>
                                                        <div className="npw-iv-progress-labels">
                                                            <span>Started: {iv.startStr}</span>
                                                            <strong>{iv.remainingMl} ml remaining</strong>
                                                            <span>Est. Completion: {iv.expectedEndStr}</span>
                                                        </div>
                                                    </div>

                                                    {/* Clean IV Timeline */}
                                                    <div className="npw-iv-timeline">
                                                        <div className="npw-iv-step done">
                                                            <div className="npw-step-dot" />
                                                            <div className="npw-step-label">{iv.startStr}</div>
                                                            <div className="npw-step-sub">{iv.medicineName} Started</div>
                                                        </div>
                                                        <div className="npw-iv-step current">
                                                            <div className="npw-step-dot current" />
                                                            <div className="npw-step-label">Current</div>
                                                            <div className="npw-step-sub">{iv.remainingMl} ml remaining</div>
                                                        </div>
                                                        <div className="npw-iv-step future">
                                                            <div className="npw-step-dot" />
                                                            <div className="npw-step-label">{iv.expectedEndStr}</div>
                                                            <div className="npw-step-sub">Expected Completion</div>
                                                        </div>
                                                    </div>

                                                    <div className="npw-iv-footer">
                                                        <span>Prescribed by: <strong>Dr. {docName || 'Attending'}</strong></span>
                                                        <span>Route: <strong>{iv.route || 'IV Infusion'}</strong></span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 5: VITALS
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'vitals' && (
                            <div className="npw-vitals-view">
                                <div className="npw-vitals-header">
                                    <div>
                                        <h2>PATIENT VITALS</h2>
                                        <p className="npw-sub-info">Continuous clinical observation and time-series vital history.</p>
                                    </div>
                                    <button className="npw-btn-primary" onClick={() => setVitalsModalOpen(true)}>
                                        <FiPlus size={14} /> Record Vitals
                                    </button>
                                </div>

                                {/* Latest Vitals Summary */}
                                {latestVitals && (
                                    <div className="npw-latest-vitals-panel">
                                        <div className="npw-lv-item">
                                            <span className="npw-lv-label">Blood Pressure</span>
                                            <span className="npw-lv-value">{latestVitals.systolicBP ? `${latestVitals.systolicBP}/${latestVitals.diastolicBP || '—'}` : '—'}</span>
                                            <span className="npw-lv-sub">mmHg</span>
                                        </div>
                                        <div className="npw-lv-item">
                                            <span className="npw-lv-label">Pulse</span>
                                            <span className="npw-lv-value">{latestVitals.pulse || '—'}</span>
                                            <span className="npw-lv-sub">bpm</span>
                                        </div>
                                        <div className="npw-lv-item">
                                            <span className="npw-lv-label">SpO₂</span>
                                            <span className="npw-lv-value">{latestVitals.spo2 ? `${latestVitals.spo2}%` : '—'}</span>
                                            <span className="npw-lv-sub">O₂ Saturation</span>
                                        </div>
                                        <div className="npw-lv-item">
                                            <span className="npw-lv-label">Temperature</span>
                                            <span className="npw-lv-value">{latestVitals.temperature ? `${latestVitals.temperature}°F` : '—'}</span>
                                            <span className="npw-lv-sub">Body Temp</span>
                                        </div>
                                        <div className="npw-lv-item">
                                            <span className="npw-lv-label">Resp. Rate</span>
                                            <span className="npw-lv-value">{latestVitals.respiratoryRate || '—'}</span>
                                            <span className="npw-lv-sub">breaths/min</span>
                                        </div>
                                        <div className="npw-lv-item">
                                            <span className="npw-lv-label">Pain Score</span>
                                            <span className="npw-lv-value">{latestVitals.painScore !== undefined ? `${latestVitals.painScore}/10` : '—'}</span>
                                            <span className="npw-lv-sub">Scale</span>
                                        </div>
                                    </div>
                                )}

                                {/* Vitals History Table */}
                                <div className="npw-card npw-vitals-table-card">
                                    <h3>Vitals History</h3>
                                    {vitalsHistory.length === 0 ? (
                                        <p className="npw-muted">No historical vitals recorded yet.</p>
                                    ) : (
                                        <div className="npw-table-responsive">
                                            <table className="npw-table">
                                                <thead>
                                                    <tr>
                                                        <th>Date & Time</th>
                                                        <th>BP (mmHg)</th>
                                                        <th>Pulse (bpm)</th>
                                                        <th>SpO₂ (%)</th>
                                                        <th>Temp (°F)</th>
                                                        <th>RR</th>
                                                        <th>Pain</th>
                                                        <th>Recorded By</th>
                                                        <th>Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {vitalsHistory.map(v => {
                                                        const nurse = typeof v.recordedBy === 'object' ? v.recordedBy?.name : (v.recordedBy || 'Nurse');
                                                        return (
                                                            <tr key={v._id}>
                                                                <td><strong>{formatTime(v.recordedAt || v.createdAt)}</strong> <span className="npw-muted">({formatDate(v.recordedAt || v.createdAt)})</span></td>
                                                                <td>{v.systolicBP ? `${v.systolicBP}/${v.diastolicBP || '—'}` : '—'}</td>
                                                                <td>{v.pulse || '—'}</td>
                                                                <td>
                                                                    <span className={v.spo2 && v.spo2 < 95 ? 'npw-alert-text' : ''}>
                                                                        {v.spo2 ? `${v.spo2}%` : '—'}
                                                                    </span>
                                                                </td>
                                                                <td>{v.temperature ? `${v.temperature}°F` : '—'}</td>
                                                                <td>{v.respiratoryRate || '—'}</td>
                                                                <td>{v.painScore !== undefined ? v.painScore : '—'}</td>
                                                                <td>{nurse}</td>
                                                                <td>{v.notes || '—'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 6: TASKS
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'tasks' && (
                            <div className="npw-tasks-view">
                                <div className="npw-tasks-header">
                                    <div>
                                        <h2>NURSING CLINICAL TASKS</h2>
                                        <p className="npw-sub-info">Actionable bedside clinical tasks, checks and doctor instructions.</p>
                                    </div>
                                    <button className="npw-btn-primary" onClick={() => setTaskModalOpen(true)}>
                                        <FiPlus size={14} /> Add Nursing Task
                                    </button>
                                </div>

                                {tasks.length === 0 ? (
                                    <div className="npw-empty-state">
                                        <div className="npw-empty-icon">✅</div>
                                        <h3>All caught up!</h3>
                                        <p>No pending nursing tasks for this patient.</p>
                                    </div>
                                ) : (
                                    <div className="npw-tasks-list">
                                        {tasks.map(task => {
                                            const isDone = task.status === 'COMPLETED';
                                            return (
                                                <div className={`npw-task-card ${isDone ? 'done' : ''}`} key={task._id}>
                                                    <div className="npw-task-left">
                                                        <button
                                                            className={`npw-task-check-btn ${isDone ? 'checked' : ''}`}
                                                            onClick={() => handleUpdateTaskStatus(task._id, isDone ? 'PENDING' : 'COMPLETED')}
                                                        >
                                                            {isDone && <FiCheck size={14} />}
                                                        </button>
                                                        <div className="npw-task-body">
                                                            <div className="npw-task-title">{task.title}</div>
                                                            {task.description && <div className="npw-task-desc">{task.description}</div>}
                                                            <div className="npw-task-meta">
                                                                <span className={`npw-task-priority ${task.priority?.toLowerCase()}`}>{task.priority || 'MEDIUM'}</span>
                                                                <span className="npw-task-type">{task.taskType}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="npw-task-right">
                                                        <span className={`npw-task-status-tag ${task.status?.toLowerCase()}`}>{task.status}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════════
                            TAB 7: HISTORY
                            ══════════════════════════════════════════════════════════ */}
                        {activeTab === 'history' && (
                            <div className="npw-history-view">
                                <div className="npw-history-header">
                                    <div>
                                        <h2>PATIENT IPD CLINICAL HISTORY</h2>
                                        <p className="npw-sub-info">Complete append-only chronological log of all medications, vitals, IV drips and clinical events.</p>
                                    </div>

                                    {/* History Filter Chips */}
                                    <div className="npw-history-filters">
                                        {['All', 'Medications', 'IV Fluids', 'Vitals', 'Tasks', 'Doctor Orders'].map(f => (
                                            <button
                                                key={f}
                                                className={`npw-hist-chip ${historyFilter === f ? 'active' : ''}`}
                                                onClick={() => setHistoryFilter(f)}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {historyTimeline.length === 0 ? (
                                    <div className="npw-empty-state">
                                        <div className="npw-empty-icon">📜</div>
                                        <h3>No history records found</h3>
                                        <p>No clinical events recorded under the selected filter.</p>
                                    </div>
                                ) : (
                                    <div className="npw-timeline-stream">
                                        {historyTimeline.map((item, idx) => (
                                            <div className="npw-hist-event" key={idx}>
                                                <div className="npw-hist-time-box">
                                                    <span className="npw-hist-time">{formatTime(item.time)}</span>
                                                    <span className="npw-hist-date">{formatDate(item.time)}</span>
                                                </div>
                                                <div className="npw-hist-line-node">
                                                    <div className={`npw-hist-dot ${item.type.toLowerCase()}`} />
                                                </div>
                                                <div className="npw-hist-content-card">
                                                    <div className="npw-hist-content-header">
                                                        <div className="npw-hist-title">{item.title}</div>
                                                        <span className={`npw-hist-badge ${item.type.toLowerCase()}`}>{item.badge}</span>
                                                    </div>
                                                    <div className="npw-hist-details">{item.details}</div>
                                                    <div className="npw-hist-footer">
                                                        <span>Logged by: <strong>{item.actor}</strong></span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── Medication Administration Modal ── */}
            <MedicationAdministrationModal
                isOpen={administerModal.open}
                onClose={() => setAdministerModal({ open: false, record: null })}
                marRecord={administerModal.record}
                patient={patientObj}
                currentNurseName={nurseName}
                onConfirmAdministration={handleConfirmAdministration}
            />

            {/* ── Record Vitals Modal ── */}
            {vitalsModalOpen && (
                <div className="npw-modal-overlay" onClick={() => setVitalsModalOpen(false)}>
                    <div className="npw-modal" onClick={e => e.stopPropagation()}>
                        <div className="npw-modal-header">
                            <h3>Record Patient Vitals</h3>
                            <button className="npw-modal-close" onClick={() => setVitalsModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleRecordVitalsSubmit}>
                            <div className="npw-modal-body">
                                <div className="npw-form-grid">
                                    <div className="npw-form-group">
                                        <label>Systolic BP (mmHg)</label>
                                        <input
                                            type="number"
                                            placeholder="120"
                                            value={vitalsForm.systolicBP}
                                            onChange={e => setVitalsForm({ ...vitalsForm, systolicBP: e.target.value })}
                                        />
                                    </div>
                                    <div className="npw-form-group">
                                        <label>Diastolic BP (mmHg)</label>
                                        <input
                                            type="number"
                                            placeholder="80"
                                            value={vitalsForm.diastolicBP}
                                            onChange={e => setVitalsForm({ ...vitalsForm, diastolicBP: e.target.value })}
                                        />
                                    </div>
                                    <div className="npw-form-group">
                                        <label>Pulse (bpm)</label>
                                        <input
                                            type="number"
                                            placeholder="78"
                                            value={vitalsForm.pulse}
                                            onChange={e => setVitalsForm({ ...vitalsForm, pulse: e.target.value })}
                                        />
                                    </div>
                                    <div className="npw-form-group">
                                        <label>SpO₂ (%)</label>
                                        <input
                                            type="number"
                                            placeholder="98"
                                            value={vitalsForm.spo2}
                                            onChange={e => setVitalsForm({ ...vitalsForm, spo2: e.target.value })}
                                        />
                                    </div>
                                    <div className="npw-form-group">
                                        <label>Temperature (°F)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="98.6"
                                            value={vitalsForm.temperature}
                                            onChange={e => setVitalsForm({ ...vitalsForm, temperature: e.target.value })}
                                        />
                                    </div>
                                    <div className="npw-form-group">
                                        <label>Respiratory Rate</label>
                                        <input
                                            type="number"
                                            placeholder="16"
                                            value={vitalsForm.respiratoryRate}
                                            onChange={e => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="npw-form-group full">
                                    <label>Clinical Observations / Notes</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Patient resting comfortably, regular sinus rhythm"
                                        value={vitalsForm.notes}
                                        onChange={e => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="npw-modal-footer">
                                <button type="button" className="npw-btn-outline" onClick={() => setVitalsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="npw-btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : 'Save Vitals'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Add Task Modal ── */}
            {taskModalOpen && (
                <div className="npw-modal-overlay" onClick={() => setTaskModalOpen(false)}>
                    <div className="npw-modal" onClick={e => e.stopPropagation()}>
                        <div className="npw-modal-header">
                            <h3>Add Nursing Task</h3>
                            <button className="npw-modal-close" onClick={() => setTaskModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateTaskSubmit}>
                            <div className="npw-modal-body">
                                <div className="npw-form-group full">
                                    <label>Task Title *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Change IV cannula site, check Foley catheter drainage"
                                        value={taskForm.title}
                                        onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="npw-form-grid">
                                    <div className="npw-form-group">
                                        <label>Task Type</label>
                                        <select
                                            value={taskForm.taskType}
                                            onChange={e => setTaskForm({ ...taskForm, taskType: e.target.value })}
                                        >
                                            <option value="MEDICATION">Medication Due</option>
                                            <option value="VITALS_CHECK">Vitals Due</option>
                                            <option value="IV_CHECK">IV Fluid Check</option>
                                            <option value="CATHETER_CHECK">Catheter Check</option>
                                            <option value="DOCTOR_INSTRUCTION">Doctor Instruction</option>
                                            <option value="OTHER">Other Bedside Care</option>
                                        </select>
                                    </div>
                                    <div className="npw-form-group">
                                        <label>Priority</label>
                                        <select
                                            value={taskForm.priority}
                                            onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}
                                        >
                                            <option value="LOW">Low</option>
                                            <option value="MEDIUM">Medium</option>
                                            <option value="HIGH">High</option>
                                            <option value="URGENT">Urgent</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="npw-form-group full">
                                    <label>Task Details (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder="Additional clinical instructions..."
                                        value={taskForm.description}
                                        onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="npw-modal-footer">
                                <button type="button" className="npw-btn-outline" onClick={() => setTaskModalOpen(false)}>Cancel</button>
                                <button type="submit" className="npw-btn-primary" disabled={submitting || !taskForm.title.trim()}>
                                    {submitting ? 'Creating...' : 'Create Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Clarify with Doctor Modal ── */}
            {clarifyModal.open && (
                <div className="npw-modal-overlay" onClick={() => setClarifyModal({ open: false, order: null, question: '' })}>
                    <div className="npw-modal" onClick={e => e.stopPropagation()}>
                        <div className="npw-modal-header">
                            <h3>Clarify Order with Doctor</h3>
                            <button className="npw-modal-close" onClick={() => setClarifyModal({ open: false, order: null, question: '' })}>✕</button>
                        </div>
                        <form onSubmit={handleSendClarification}>
                            <div className="npw-modal-body">
                                <p className="npw-muted">
                                    Order: <strong>{clarifyModal.order?.medicineName} ({clarifyModal.order?.dosageValue} {clarifyModal.order?.dosageUnit} {clarifyModal.order?.route})</strong>
                                </p>
                                <div className="npw-form-group full">
                                    <label>Question / Query for Doctor *</label>
                                    <textarea
                                        rows={3}
                                        placeholder="e.g. Please confirm if dose should be given pre or post meal, patient experiencing mild nausea."
                                        value={clarifyModal.question}
                                        onChange={e => setClarifyModal({ ...clarifyModal, question: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="npw-modal-footer">
                                <button type="button" className="npw-btn-outline" onClick={() => setClarifyModal({ open: false, order: null, question: '' })}>Cancel</button>
                                <button type="submit" className="npw-btn-primary" disabled={submitting || !clarifyModal.question.trim()}>
                                    {submitting ? 'Sending...' : 'Send to Doctor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Add Nursing Note Modal ── */}
            {noteModalOpen && (
                <div className="npw-modal-overlay" onClick={() => setNoteModalOpen(false)}>
                    <div className="npw-modal" onClick={e => e.stopPropagation()}>
                        <div className="npw-modal-header">
                            <h3>Record Nursing Note</h3>
                            <button className="npw-modal-close" onClick={() => setNoteModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleRecordNoteSubmit}>
                            <div className="npw-modal-body">
                                <div className="npw-form-grid">
                                    <div className="npw-form-group">
                                        <label>Category</label>
                                        <select
                                            value={noteForm.noteType}
                                            onChange={e => setNoteForm({ ...noteForm, noteType: e.target.value })}
                                        >
                                            <option value="GENERAL">General Care Note</option>
                                            <option value="PATIENT_CONDITION">Patient Condition</option>
                                            <option value="OBSERVATION">Clinical Observation</option>
                                            <option value="MEDICATION">Medication Assessment</option>
                                            <option value="POST_OP">Post-Op Recovery</option>
                                            <option value="WOUND">Wound & Dressing</option>
                                            <option value="SAFETY">Safety & Fall Risk</option>
                                            <option value="OTHER">Other Bedside Note</option>
                                        </select>
                                    </div>
                                    <div className="npw-form-group">
                                        <label>Shift</label>
                                        <select
                                            value={noteForm.shift}
                                            onChange={e => setNoteForm({ ...noteForm, shift: e.target.value })}
                                        >
                                            <option value="Morning">Morning Shift (07:00 - 15:00)</option>
                                            <option value="Evening">Evening Shift (15:00 - 23:00)</option>
                                            <option value="Night">Night Shift (23:00 - 07:00)</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="npw-form-group full">
                                    <label>Priority</label>
                                    <select
                                        value={noteForm.priority}
                                        onChange={e => setNoteForm({ ...noteForm, priority: e.target.value })}
                                    >
                                        <option value="Normal">Normal</option>
                                        <option value="High">High Attention</option>
                                        <option value="Urgent">Urgent / Critical</option>
                                    </select>
                                </div>
                                <div className="npw-form-group full">
                                    <label>Nursing Clinical Note *</label>
                                    <textarea
                                        rows={4}
                                        placeholder="Record bedside observations, patient complaints, nursing actions, vitals assessment, or clinical findings..."
                                        value={noteForm.note}
                                        onChange={e => setNoteForm({ ...noteForm, note: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="npw-modal-footer">
                                <button type="button" className="npw-btn-outline" onClick={() => setNoteModalOpen(false)}>Cancel</button>
                                <button type="submit" className="npw-btn-primary" disabled={submitting || !noteForm.note.trim()}>
                                    {submitting ? 'Saving...' : 'Save Nursing Note'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NursePatientWorkspace;
