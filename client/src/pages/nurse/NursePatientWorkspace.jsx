import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    admissionAPI,
    ipdClinicalAPI,
    nursingNoteAPI,
    nursingTaskAPI,
    intakeOutputAPI,
    ipdLineAPI,
    ipdCatheterAPI,
    woundCareAPI,
    nurseHandoverAPI,
    ipdNursingAPI,
    ipdCommandCenterAPI
} from '../../utils/api';
import socket from '../../utils/socket';
import {
    FiArrowLeft,
    FiClipboard,
    FiActivity,
    FiDroplet,
    FiFileText,
    FiCheckSquare,
    FiClock,
    FiEye,
    FiPlus,
    FiCheck,
    FiPause,
    FiX,
    FiAlertCircle,
    FiAlertTriangle,
    FiRefreshCw,
    FiLayers,
    FiScissors,
    FiFilePlus,
    FiLogOut,
    FiUserCheck,
    FiCheckCircle,
    FiShield,
    FiXCircle
} from 'react-icons/fi';
import './NursePatientWorkspace.css';

// ── Tab definitions ──
const TABS = [
    { key: 'overview', label: 'Overview', icon: <FiEye size={14} /> },
    { key: 'orders', label: 'Doctor Orders', icon: <FiClipboard size={14} /> },
    { key: 'vitals', label: 'Vitals', icon: <FiActivity size={14} /> },
    { key: 'mar', label: 'MAR', icon: <FiDroplet size={14} /> },
    { key: 'notes', label: 'Nursing Notes', icon: <FiFileText size={14} /> },
    { key: 'tasks', label: 'Tasks', icon: <FiCheckSquare size={14} /> },
    { key: 'io', label: 'Intake / Output', icon: <FiDroplet size={14} /> },
    { key: 'lines', label: 'Lines & Devices', icon: <FiLayers size={14} /> },
    { key: 'wound', label: 'Wound Care', icon: <FiFilePlus size={14} /> },
    { key: 'investigations', label: 'Investigations', icon: <FiClipboard size={14} /> },
    { key: 'handover', label: 'Handover', icon: <FiRefreshCw size={14} /> },
    { key: 'ot', label: 'OT & Post-Op', icon: <FiScissors size={14} /> },
    { key: 'discharge', label: 'Discharge Readiness', icon: <FiLogOut size={14} /> },
    { key: 'timeline', label: 'Timeline', icon: <FiClock size={14} /> },
];

const VITALS_INIT = { systolicBP: '', diastolicBP: '', pulse: '', temperature: '', spo2: '', respiratoryRate: '', painScore: '', notes: '' };
const NOTE_INIT = { note: '', noteType: 'GENERAL', shift: 'Morning', priority: 'Normal' };
const TASK_INIT = { title: '', description: '', taskType: 'OTHER', priority: 'MEDIUM', scheduledAt: '' };
const IO_INIT = { category: 'INTAKE', type: 'Oral', amount: '', unit: 'ml', source: '', notes: '' };
const LINE_INIT = { lineType: 'IV_CANNULA', site: '', gauge: '20G', notes: '' };
const CATHETER_INIT = { catheterType: 'FOLEY', size: '16 Fr', site: 'Urethral', notes: '' };
const WOUND_INIT = { woundSite: '', woundType: 'Surgical', condition: 'Clean', dressingType: 'Gauze', drainageAmount: 'None', drainageType: '', notes: '' };
const HANDOVER_INIT = { shift: 'Morning to Evening', summary: '', importantObservations: '', pendingTasks: '', medicationConcerns: '', safetyConcerns: '' };

const NursePatientWorkspace = () => {
    const { admissionId } = useParams();
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const [activeTab, setActiveTab] = useState('overview');
    const [admission, setAdmission] = useState(null);
    const [orders, setOrders] = useState([]);
    const [vitalsHistory, setVitalsHistory] = useState([]);
    const [latestVitals, setLatestVitals] = useState(null);
    const [marRecords, setMARRecords] = useState([]);
    const [notes, setNotes] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [ioRecords, setIoRecords] = useState([]);
    const [ioSummary, setIoSummary] = useState(null);
    const [lines, setLines] = useState([]);
    const [catheters, setCatheters] = useState([]);
    const [woundRecords, setWoundRecords] = useState([]);
    const [investigations, setInvestigations] = useState([]);
    const [handovers, setHandovers] = useState([]);
    const [otPlans, setOtPlans] = useState([]);
    const [timelineItems, setTimelineItems] = useState([]);
    const [dischargeReadiness, setDischargeReadiness] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [hospitalNurses, setHospitalNurses] = useState([]);

    const [loading, setLoading] = useState({
        admission: true,
        orders: false,
        vitals: false,
        mar: false,
        notes: false,
        tasks: false,
        io: false,
        lines: false,
        wound: false,
        investigations: false,
        handover: false,
        ot: false,
        timeline: false,
        discharge: false
    });

    // Form states
    const [vitalsForm, setVitalsForm] = useState(VITALS_INIT);
    const [noteForm, setNoteForm] = useState(NOTE_INIT);
    const [taskForm, setTaskForm] = useState(TASK_INIT);
    const [ioForm, setIoForm] = useState(IO_INIT);
    const [lineForm, setLineForm] = useState(LINE_INIT);
    const [catheterForm, setCatheterForm] = useState(CATHETER_INIT);
    const [woundForm, setWoundForm] = useState(WOUND_INIT);
    const [handoverForm, setHandoverForm] = useState(HANDOVER_INIT);

    // Modal states
    const [marModal, setMarModal] = useState({ open: false, record: null, action: '', reason: '' });
    const [taskModal, setTaskModal] = useState({ open: false, task: null, action: '', notes: '' });
    const [deviceRemoveModal, setDeviceRemoveModal] = useState({ open: false, type: '', id: '', reason: '', notes: '' });
    const [newTaskModalOpen, setNewTaskModalOpen] = useState(false);
    const [newLineModalOpen, setNewLineModalOpen] = useState(false);
    const [newCathModalOpen, setNewCathModalOpen] = useState(false);

    // Phase 6 Assignment & Discharge Modals
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [assignForm, setAssignForm] = useState({ nurseId: '', shift: 'Morning', notes: '' });
    const [clearanceModalOpen, setClearanceModalOpen] = useState(false);
    const [clearanceNotes, setClearanceNotes] = useState('');
    const [clearanceConfirmed, setClearanceConfirmed] = useState(false);

    // Phase 7 Coordination & Blocker Engine States
    const [clarificationModal, setClarificationModal] = useState({
        open: false,
        order: null,
        issueType: 'DOSAGE_CONFIRMATION',
        question: ''
    });
    const [blockersData, setBlockersData] = useState(null);
    const [loadingBlockers, setLoadingBlockers] = useState(false);

    // Saving flags
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState(null);
    const [taskFilter, setTaskFilter] = useState('ALL');

    const toastTimeoutRef = useRef(null);

    // ── Show toast helper ──
    const showToast = useCallback((message, type = 'success') => {
        setToast({ message, type });
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Fetch admission details ──
    const fetchAdmission = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, admission: true }));
            const res = await admissionAPI.getActiveAdmissions();
            const list = res.admissions || res.data || [];
            const adm = list.find(a => a._id === admissionId);
            if (adm) {
                setAdmission(adm);
            }
        } catch (err) {
            console.error('Error fetching admission:', err);
        } finally {
            setLoading(prev => ({ ...prev, admission: false }));
        }
    }, [admissionId]);

    // ── Fetch orders ──
    const fetchOrders = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, orders: true }));
            const res = await ipdClinicalAPI.getOrders(admissionId);
            setOrders(res.orders || res.data || []);
        } catch (err) {
            console.error('Error fetching orders:', err);
        } finally {
            setLoading(prev => ({ ...prev, orders: false }));
        }
    }, [admissionId]);

    // ── Fetch Discharge Blockers Engine (Phase 7) ──
    const fetchDischargeBlockers = useCallback(async () => {
        if (!admissionId) return;
        setLoadingBlockers(true);
        try {
            const res = await ipdCommandCenterAPI.getDischargeBlockers(admissionId);
            if (res?.success || res?.blockers) {
                setBlockersData(res);
            }
        } catch (err) {
            console.warn('Error fetching discharge blockers:', err);
        } finally {
            setLoadingBlockers(false);
        }
    }, [admissionId]);

    // ── Order Acknowledgment Handler (Phase 7) ──
    const handleAcknowledgeOrder = async (orderId) => {
        try {
            setSubmitting(true);
            const res = await ipdClinicalAPI.acknowledgeOrder(admissionId, orderId, {
                shift: 'General',
                notes: 'Acknowledged by bedside nurse'
            });
            if (res?.success || res?.order) {
                showToast('Order acknowledged by nursing station', 'success');
                fetchOrders();
                fetchTimeline();
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to acknowledge order', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Request Clarification Handler (Phase 7) ──
    const handleSubmitClarification = async (e) => {
        e.preventDefault();
        if (!clarificationModal.question.trim() || !clarificationModal.order) return;
        try {
            setSubmitting(true);
            const res = await ipdClinicalAPI.requestClarification(admissionId, clarificationModal.order._id, {
                issueType: clarificationModal.issueType,
                question: clarificationModal.question.trim()
            });
            if (res?.success || res?.order) {
                showToast('Clarification request sent to attending doctor', 'success');
                setClarificationModal({ open: false, order: null, issueType: 'DOSAGE_CONFIRMATION', question: '' });
                fetchOrders();
                fetchTimeline();
            }
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to submit clarification', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Fetch vitals ──
    const fetchVitals = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, vitals: true }));
            const [historyRes, latestRes] = await Promise.all([
                ipdClinicalAPI.getVitalsHistory(admissionId),
                ipdClinicalAPI.getLatestVitals(admissionId)
            ]);
            setVitalsHistory(historyRes.vitals || []);
            setLatestVitals(latestRes.vitals || null);
        } catch (err) {
            console.error('Error fetching vitals:', err);
        } finally {
            setLoading(prev => ({ ...prev, vitals: false }));
        }
    }, [admissionId]);

    // ── Fetch MAR ──
    const fetchMAR = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, mar: true }));
            const res = await ipdClinicalAPI.getMARRecords(admissionId);
            setMARRecords(res.marRecords || []);
        } catch (err) {
            console.error('Error fetching MAR:', err);
        } finally {
            setLoading(prev => ({ ...prev, mar: false }));
        }
    }, [admissionId]);

    // ── Fetch Nursing Notes ──
    const fetchNotes = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, notes: true }));
            const res = await nursingNoteAPI.getNotes(admissionId);
            setNotes(res.notes || res.data || []);
        } catch (err) {
            console.error('Error fetching notes:', err);
        } finally {
            setLoading(prev => ({ ...prev, notes: false }));
        }
    }, [admissionId]);

    // ── Fetch Tasks ──
    const fetchTasks = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, tasks: true }));
            const res = await nursingTaskAPI.getTasks(admissionId);
            setTasks(res.tasks || res.data || []);
        } catch (err) {
            console.error('Error fetching tasks:', err);
        } finally {
            setLoading(prev => ({ ...prev, tasks: false }));
        }
    }, [admissionId]);

    // ── Fetch Intake / Output ──
    const fetchIO = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, io: true }));
            const [historyRes, summaryRes] = await Promise.all([
                intakeOutputAPI.getHistory(admissionId),
                intakeOutputAPI.getSummary(admissionId)
            ]);
            setIoRecords(historyRes.records || historyRes.data || []);
            setIoSummary(summaryRes.summary || summaryRes.data || null);
        } catch (err) {
            console.error('Error fetching I/O:', err);
        } finally {
            setLoading(prev => ({ ...prev, io: false }));
        }
    }, [admissionId]);

    // ── Fetch Lines & Catheters ──
    const fetchDevices = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, lines: true }));
            const [linesRes, cathsRes] = await Promise.all([
                ipdLineAPI.getLines(admissionId),
                ipdCatheterAPI.getCatheters(admissionId)
            ]);
            setLines(linesRes.lines || linesRes.data || []);
            setCatheters(cathsRes.catheters || cathsRes.data || []);
        } catch (err) {
            console.error('Error fetching devices:', err);
        } finally {
            setLoading(prev => ({ ...prev, lines: false }));
        }
    }, [admissionId]);

    // ── Fetch Wound Care ──
    const fetchWoundCare = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, wound: true }));
            const res = await woundCareAPI.getHistory(admissionId);
            setWoundRecords(res.records || res.data || []);
        } catch (err) {
            console.error('Error fetching wound care:', err);
        } finally {
            setLoading(prev => ({ ...prev, wound: false }));
        }
    }, [admissionId]);

    // ── Fetch Investigations ──
    const fetchInvestigations = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, investigations: true }));
            const res = await ipdNursingAPI.getInvestigations(admissionId);
            setInvestigations(res.investigations || res.data?.investigations || []);
        } catch (err) {
            console.error('Error fetching investigations:', err);
        } finally {
            setLoading(prev => ({ ...prev, investigations: false }));
        }
    }, [admissionId]);

    // ── Fetch Shift Handover ──
    const fetchHandovers = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, handover: true }));
            const res = await nurseHandoverAPI.getHandovers(admissionId);
            setHandovers(res.handovers || res.data || []);
        } catch (err) {
            console.error('Error fetching handovers:', err);
        } finally {
            setLoading(prev => ({ ...prev, handover: false }));
        }
    }, [admissionId]);

    // ── Fetch OT Plans ──
    const fetchOTPlans = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, ot: true }));
            const res = await ipdNursingAPI.getOTPlans(admissionId);
            setOtPlans(res.surgeryPlans || res.data || []);
        } catch (err) {
            console.error('Error fetching OT plans:', err);
        } finally {
            setLoading(prev => ({ ...prev, ot: false }));
        }
    }, [admissionId]);

    // ── Fetch Unified Timeline ──
    const fetchTimeline = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, timeline: true }));
            const res = await ipdNursingAPI.getTimeline(admissionId);
            setTimelineItems(res.timeline || res.data || []);
        } catch (err) {
            console.error('Error fetching timeline:', err);
        } finally {
            setLoading(prev => ({ ...prev, timeline: false }));
        }
    }, [admissionId]);

    // ── Fetch Discharge Readiness ──
    const fetchDischargeReadiness = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, discharge: true }));
            const res = await ipdNursingAPI.getDischargeReadiness(admissionId);
            setDischargeReadiness(res.readiness || res.data || null);
        } catch (err) {
            console.error('Error fetching discharge readiness:', err);
        } finally {
            setLoading(prev => ({ ...prev, discharge: false }));
        }
    }, [admissionId]);

    // ── Fetch Clinical Alerts ──
    const fetchAlerts = useCallback(async () => {
        try {
            const res = await ipdNursingAPI.getAdmissionAlerts(admissionId);
            setAlerts(res.alerts || res.data || []);
        } catch (err) {
            console.error('Error fetching alerts:', err);
        }
    }, [admissionId]);

    // ── Fetch Hospital Nurses ──
    const fetchHospitalNurses = useCallback(async () => {
        try {
            const res = await ipdNursingAPI.getHospitalNurses();
            setHospitalNurses(res.nurses || res.data || []);
        } catch (err) {
            console.error('Error fetching hospital nurses:', err);
        }
    }, []);

    // ── Master initial data loader ──
    useEffect(() => {
        fetchAdmission();
        fetchOrders();
        fetchVitals();
        fetchMAR();
        fetchNotes();
        fetchTasks();
        fetchIO();
        fetchDevices();
        fetchWoundCare();
        fetchInvestigations();
        fetchHandovers();
        fetchOTPlans();
        fetchTimeline();
        fetchDischargeReadiness();
        fetchAlerts();
        fetchHospitalNurses();
        fetchDischargeBlockers();
    }, [
        fetchAdmission,
        fetchOrders,
        fetchVitals,
        fetchMAR,
        fetchNotes,
        fetchTasks,
        fetchIO,
        fetchDevices,
        fetchWoundCare,
        fetchInvestigations,
        fetchHandovers,
        fetchOTPlans,
        fetchTimeline,
        fetchDischargeReadiness,
        fetchAlerts,
        fetchHospitalNurses,
        fetchDischargeBlockers
    ]);

    // ── Socket.IO Real-time Synchronization ──
    useEffect(() => {
        const handleRefresh = (data) => {
            if (data?.admissionId && String(data.admissionId) !== String(admissionId)) return;
            fetchAdmission();
            fetchOrders();
            fetchVitals();
            fetchMAR();
            fetchNotes();
            fetchTasks();
            fetchIO();
            fetchDevices();
            fetchWoundCare();
            fetchInvestigations();
            fetchHandovers();
            fetchOTPlans();
            fetchTimeline();
            fetchDischargeReadiness();
            fetchAlerts();
        };

        socket.on('admission_updated', handleRefresh);
        socket.on('nurse_assigned', handleRefresh);
        socket.on('nurse_unassigned', handleRefresh);
        socket.on('discharge_readiness_changed', handleRefresh);
        socket.on('patient_discharged', handleRefresh);
        socket.on('inpatient_order_created', handleRefresh);
        socket.on('inpatient_order_updated', handleRefresh);
        socket.on('vitals_recorded', handleRefresh);
        socket.on('mar_administered', handleRefresh);
        socket.on('nursing_note_created', handleRefresh);
        socket.on('nursing_task_created', handleRefresh);
        socket.on('nursing_task_updated', handleRefresh);
        socket.on('intake_output_recorded', handleRefresh);
        socket.on('line_status_changed', handleRefresh);
        socket.on('catheter_status_changed', handleRefresh);
        socket.on('wound_care_recorded', handleRefresh);
        socket.on('nurse_handover_created', handleRefresh);

        return () => {
            socket.off('admission_updated', handleRefresh);
            socket.off('nurse_assigned', handleRefresh);
            socket.off('nurse_unassigned', handleRefresh);
            socket.off('discharge_readiness_changed', handleRefresh);
            socket.off('patient_discharged', handleRefresh);
            socket.off('inpatient_order_created', handleRefresh);
            socket.off('inpatient_order_updated', handleRefresh);
            socket.off('vitals_recorded', handleRefresh);
            socket.off('mar_administered', handleRefresh);
            socket.off('nursing_note_created', handleRefresh);
            socket.off('nursing_task_created', handleRefresh);
            socket.off('nursing_task_updated', handleRefresh);
            socket.off('intake_output_recorded', handleRefresh);
            socket.off('line_status_changed', handleRefresh);
            socket.off('catheter_status_changed', handleRefresh);
            socket.off('wound_care_recorded', handleRefresh);
            socket.off('nurse_handover_created', handleRefresh);
        };
    }, [admissionId, fetchAdmission, fetchOrders, fetchVitals, fetchMAR, fetchNotes, fetchTasks, fetchIO, fetchDevices, fetchWoundCare, fetchInvestigations, fetchHandovers, fetchOTPlans, fetchTimeline, fetchDischargeReadiness, fetchAlerts]);

    // ── ACTION HANDLERS ──

    // 1. Record Vitals
    const handleRecordVitals = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const payload = {
                systolicBP: vitalsForm.systolicBP ? Number(vitalsForm.systolicBP) : undefined,
                diastolicBP: vitalsForm.diastolicBP ? Number(vitalsForm.diastolicBP) : undefined,
                pulse: vitalsForm.pulse ? Number(vitalsForm.pulse) : undefined,
                temperature: vitalsForm.temperature ? Number(vitalsForm.temperature) : undefined,
                spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : undefined,
                respiratoryRate: vitalsForm.respiratoryRate ? Number(vitalsForm.respiratoryRate) : undefined,
                painScore: vitalsForm.painScore !== '' ? Number(vitalsForm.painScore) : undefined,
                notes: vitalsForm.notes.trim() || undefined,
            };
            await ipdClinicalAPI.recordVitals(admissionId, payload);
            setVitalsForm(VITALS_INIT);
            showToast('Vitals recorded successfully');
            fetchVitals();
            fetchTimeline();
            fetchAlerts();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error recording vitals', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 2. Add Nursing Note
    const handleAddNote = async (e) => {
        e.preventDefault();
        if (!noteForm.note.trim()) {
            showToast('Note content is required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await nursingNoteAPI.createNote(admissionId, noteForm);
            setNoteForm(NOTE_INIT);
            showToast('Nursing note saved to patient record');
            fetchNotes();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error saving note', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 3. Create Task
    const handleCreateTask = async (e) => {
        e.preventDefault();
        if (!taskForm.title.trim()) {
            showToast('Task title is required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await nursingTaskAPI.createTask({
                ...taskForm,
                admissionId
            });
            setTaskForm(TASK_INIT);
            setNewTaskModalOpen(false);
            showToast('Clinical task scheduled');
            fetchTasks();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error creating task', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 4. Update Task Status
    const handleUpdateTaskStatus = async () => {
        if (!taskModal.task) return;
        try {
            setSubmitting(true);
            await nursingTaskAPI.updateTask(taskModal.task._id, {
                status: taskModal.action,
                notes: taskModal.notes
            });
            setTaskModal({ open: false, task: null, action: '', notes: '' });
            showToast(`Task marked as ${taskModal.action}`);
            fetchTasks();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error updating task', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 5. Record Intake / Output
    const handleRecordIO = async (e) => {
        e.preventDefault();
        if (!ioForm.amount || Number(ioForm.amount) <= 0) {
            showToast('Please enter a valid amount', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await intakeOutputAPI.recordIO(admissionId, {
                category: ioForm.category,
                type: ioForm.type,
                amount: Number(ioForm.amount),
                unit: ioForm.unit,
                source: ioForm.source.trim() || undefined,
                notes: ioForm.notes.trim() || undefined,
            });
            setIoForm(IO_INIT);
            showToast('Fluid intake/output entry saved');
            fetchIO();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error recording I/O', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 6. Insert Line
    const handleInsertLine = async (e) => {
        e.preventDefault();
        if (!lineForm.site.trim()) {
            showToast('Anatomical site is required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await ipdLineAPI.insertLine(admissionId, lineForm);
            setLineForm(LINE_INIT);
            setNewLineModalOpen(false);
            showToast('Line/Cannula insertion recorded');
            fetchDevices();
            fetchTimeline();
            fetchDischargeReadiness();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error inserting line', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 7. Insert Catheter
    const handleInsertCatheter = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await ipdCatheterAPI.insertCatheter(admissionId, catheterForm);
            setCatheterForm(CATHETER_INIT);
            setNewCathModalOpen(false);
            showToast('Catheter insertion recorded');
            fetchDevices();
            fetchTimeline();
            fetchDischargeReadiness();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error inserting catheter', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 8. Remove Device
    const handleRemoveDevice = async () => {
        const { type, id, reason, notes } = deviceRemoveModal;
        if (!id) return;
        try {
            setSubmitting(true);
            if (type === 'LINE') {
                await ipdLineAPI.removeLine(id, { removalReason: reason, notes });
                showToast('Line removed from patient record');
            } else {
                await ipdCatheterAPI.removeCatheter(id, { removalReason: reason, notes });
                showToast('Catheter removed from patient record');
            }
            setDeviceRemoveModal({ open: false, type: '', id: '', reason: '', notes: '' });
            fetchDevices();
            fetchTimeline();
            fetchDischargeReadiness();
            fetchAlerts();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error removing device', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 9. Record Wound Care
    const handleRecordWound = async (e) => {
        e.preventDefault();
        if (!woundForm.woundSite.trim()) {
            showToast('Wound site is required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await woundCareAPI.recordCare(admissionId, woundForm);
            setWoundForm(WOUND_INIT);
            showToast('Wound dressing recorded');
            fetchWoundCare();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error saving wound record', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 10. Submit Shift Handover
    const handleSaveHandover = async (e) => {
        e.preventDefault();
        if (!handoverForm.summary.trim()) {
            showToast('Handover clinical summary is required', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await nurseHandoverAPI.createHandover(admissionId, handoverForm);
            setHandoverForm(HANDOVER_INIT);
            showToast('Shift handover recorded to permanent record');
            fetchHandovers();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error saving handover', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 11. MAR Actions
    const handleMARAction = async () => {
        const { record, action, reason } = marModal;
        if (!record) return;
        try {
            setSubmitting(true);
            await ipdClinicalAPI.updateMARRecord(record._id, {
                status: action,
                reason: reason.trim() || undefined,
            });
            setMarModal({ open: false, record: null, action: '', reason: '' });
            showToast(`Medication marked as ${action}`);
            fetchMAR();
            fetchTimeline();
            fetchDischargeReadiness();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error updating MAR', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const openMARModal = (record, action) => {
        if (action === 'ADMINISTERED') {
            (async () => {
                try {
                    setSubmitting(true);
                    await ipdClinicalAPI.updateMARRecord(record._id, { status: 'ADMINISTERED' });
                    showToast('Medication administered');
                    fetchMAR();
                    fetchTimeline();
                    fetchDischargeReadiness();
                } catch (err) {
                    showToast(err.response?.data?.message || 'Error administering medication', 'error');
                } finally {
                    setSubmitting(false);
                }
            })();
        } else {
            setMarModal({ open: true, record, action, reason: '' });
        }
    };

    // 12. Assign Care Nurse (Phase 6)
    const handleAssignNurseSubmit = async (e) => {
        e.preventDefault();
        if (!assignForm.nurseId) {
            showToast('Please select a nurse to assign', 'error');
            return;
        }
        try {
            setSubmitting(true);
            await ipdNursingAPI.assignNurse(admissionId, {
                nurseId: assignForm.nurseId,
                shift: assignForm.shift,
                notes: assignForm.notes
            });
            setAssignModalOpen(false);
            setAssignForm({ nurseId: '', shift: 'Morning', notes: '' });
            showToast('Nurse assigned successfully');
            fetchAdmission();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error assigning nurse', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 13. Sign-off Nursing Clearance (Phase 6)
    const handleSignOffClearance = async (e) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const res = await ipdNursingAPI.signOffNursingClearance(admissionId, {
                nursingNotes: clearanceNotes
            });
            setClearanceModalOpen(false);
            setClearanceNotes('');
            showToast(res.message || 'Nursing clinical clearance signed off successfully');
            fetchAdmission();
            fetchDischargeReadiness();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error signing clearance', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Patient details helpers ──
    const patient = admission?.patientId || {};
    const patientName = typeof patient === 'object' ? (patient.name || 'Unknown') : 'Unknown';
    const patientUid = typeof patient === 'object' ? (patient.patientId || patient.mrn || '') : '';
    const doctor = admission?.doctorId || {};
    const doctorName = typeof doctor === 'object' ? (doctor.name || 'Not Assigned') : 'Not Assigned';
    const activeLines = lines.filter(l => l.status === 'ACTIVE');
    const activeCatheters = catheters.filter(c => c.status === 'ACTIVE');

    // Active Assigned Nurses
    const activeAssignments = (admission?.assignedNurses || []).filter(n => n.status === 'ACTIVE');
    const assignedNurseNames = activeAssignments.map(a => {
        if (typeof a.nurseId === 'object' && a.nurseId?.name) return `${a.nurseId.name} (${a.shift || 'Shift'})`;
        const found = hospitalNurses.find(hn => String(hn._id) === String(a.nurseId));
        return found ? `${found.name} (${a.shift || 'Shift'})` : 'Assigned Nurse';
    });

    const isDischargeOrdered = !!dischargeReadiness?.doctorDischargeOrdered;
    const isNursingCleared = !!dischargeReadiness?.nursingClearance;

    // ── TAB RENDERERS ──

    // 1. OVERVIEW TAB
    const renderOverview = () => (
        <div className="nw-overview-layout">
            {/* Safety & Clinical Alerts Box */}
            {alerts.length > 0 && (
                <div className="nw-alerts-banner">
                    <div className="nw-alerts-banner-head">
                        <FiAlertTriangle size={18} color="#dc2626" />
                        <h4>Active Clinical & Safety Alerts ({alerts.length})</h4>
                    </div>
                    <div className="nw-alerts-list">
                        {alerts.map((alt, idx) => (
                            <div className={`nw-alert-card ${alt.severity.toLowerCase()}`} key={idx}>
                                <div className="nw-alert-title">
                                    <strong>{alt.title}</strong>
                                    <span className="nw-alert-badge">{alt.severity}</span>
                                </div>
                                <div className="nw-alert-desc">{alt.description}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="nw-overview-grid">
                <div className="nw-overview-card">
                    <h3>Patient Information</h3>
                    <div className="nw-detail-row"><span className="nw-detail-label">Name</span><span className="nw-detail-value">{patientName}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Patient ID</span><span className="nw-detail-value">{patientUid || '—'}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Age / Gender</span><span className="nw-detail-value">{patient.age ? `${patient.age} yrs` : '—'} • {patient.gender || '—'}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Blood Group</span><span className="nw-detail-value">{patient.bloodGroup || '—'}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Phone</span><span className="nw-detail-value">{patient.phone || '—'}</span></div>
                </div>

                <div className="nw-overview-card">
                    <h3>Admission Details</h3>
                    <div className="nw-detail-row"><span className="nw-detail-label">Ward</span><span className="nw-detail-value">{admission?.ward || '—'}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Bed</span><span className="nw-detail-value">{admission?.bedNumber || '—'}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Attending Doctor</span><span className="nw-detail-value">{doctorName !== 'Not Assigned' ? `Dr. ${doctorName}` : '—'}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Admitted</span><span className="nw-detail-value">{admission?.admissionDate ? new Date(admission.admissionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span></div>
                    <div className="nw-detail-row">
                        <span className="nw-detail-label">Care Nurse</span>
                        <span className="nw-detail-value">
                            {assignedNurseNames.length > 0 ? assignedNurseNames.join(', ') : (
                                <button className="nw-mini-link" onClick={() => setAssignModalOpen(true)}>+ Assign Nurse</button>
                            )}
                        </span>
                    </div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Status</span><span className="nw-detail-value">{admission?.status || 'Admitted'}</span></div>
                </div>

                <div className="nw-overview-card">
                    <h3>Latest Vitals Snapshot</h3>
                    {latestVitals ? (
                        <div className="nw-vitals-grid">
                            <div className="nw-vital-item">
                                <span className="nw-vital-lbl">BP</span>
                                <span className="nw-vital-val">{latestVitals.systolicBP ? `${latestVitals.systolicBP}/${latestVitals.diastolicBP}` : '—'}</span>
                            </div>
                            <div className="nw-vital-item">
                                <span className="nw-vital-lbl">Pulse</span>
                                <span className="nw-vital-val">{latestVitals.pulse || '—'} bpm</span>
                            </div>
                            <div className="nw-vital-item">
                                <span className="nw-vital-lbl">SpO₂</span>
                                <span className="nw-vital-val" style={{ color: latestVitals.spo2 < 95 ? '#dc2626' : '#059669' }}>
                                    {latestVitals.spo2 ? `${latestVitals.spo2}%` : '—'}
                                </span>
                            </div>
                            <div className="nw-vital-item">
                                <span className="nw-vital-lbl">Temp</span>
                                <span className="nw-vital-val">{latestVitals.temperature ? `${latestVitals.temperature}°F` : '—'}</span>
                            </div>
                        </div>
                    ) : (
                        <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>No vitals recorded yet.</p>
                    )}
                </div>

                <div className="nw-overview-card">
                    <h3>Clinical Status & Discharge Readiness</h3>
                    <div className="nw-detail-row"><span className="nw-detail-label">Active Orders</span><span className="nw-detail-value">{orders.filter(o => o.status === 'ACTIVE').length}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Pending MAR</span><span className="nw-detail-value">{marRecords.filter(m => ['SCHEDULED', 'DUE'].includes(m.status)).length}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Active Lines / Cannulas</span><span className="nw-detail-value">{activeLines.length}</span></div>
                    <div className="nw-detail-row"><span className="nw-detail-label">Active Catheters</span><span className="nw-detail-value">{activeCatheters.length}</span></div>
                    <div className="nw-detail-row">
                        <span className="nw-detail-label">Discharge Order</span>
                        <span className="nw-detail-value">
                            {isDischargeOrdered ? (
                                <span className="nw-tag success">✓ Doctor Ordered</span>
                            ) : (
                                <span className="nw-tag default">Pending Order</span>
                            )}
                        </span>
                    </div>
                    <div className="nw-detail-row">
                        <span className="nw-detail-label">Nursing Clearance</span>
                        <span className="nw-detail-value">
                            {isNursingCleared ? (
                                <span className="nw-tag success">✓ Cleared</span>
                            ) : (
                                <button className="nw-mini-btn" onClick={() => setActiveTab('discharge')}>Check Readiness</button>
                            )}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );

    // 2. DOCTOR ORDERS TAB (Clinical Verification & Clarification)
    const renderOrders = () => (
        <div className="nw-section">
            <div className="nw-table-wrapper">
                <div className="nw-table-header">
                    <h3>📋 Doctor IPD Orders & Nursing Acknowledgment</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.orders ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading orders...</div>
                ) : orders.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No clinical orders for this admission yet.</div>
                ) : (
                    <div className="nw-table-scroll">
                        <table className="nw-table">
                            <thead>
                                <tr>
                                    <th>Medicine / Item</th>
                                    <th>Dosage</th>
                                    <th>Route</th>
                                    <th>Freq</th>
                                    <th>Duration</th>
                                    <th>Acknowledgment</th>
                                    <th>Clarification</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map(o => {
                                    const acks = o.acknowledgments || [];
                                    const hasAck = acks.length > 0;
                                    const clars = o.clarifications || [];
                                    const openClar = clars.find(c => c.status === 'OPEN');
                                    const resolvedClar = clars.filter(c => c.status === 'RESOLVED').pop();

                                    return (
                                        <tr key={o._id}>
                                            <td style={{ fontWeight: 600 }}>
                                                {o.medicineName}
                                                {o.instructions && (
                                                    <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 400 }}>
                                                        Inst: {o.instructions}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{o.dosageValue || ''} {o.dosageUnit || ''}</td>
                                            <td><span className="nw-route-badge">{o.route || 'Oral'}</span></td>
                                            <td><strong>{o.frequency || 'OD'}</strong></td>
                                            <td>{o.duration || '—'}</td>
                                            <td>
                                                {hasAck ? (
                                                    <span className="nw-tag success">✓ Acknowledged</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="nw-mini-btn"
                                                        onClick={() => handleAcknowledgeOrder(o._id)}
                                                        disabled={submitting}
                                                    >
                                                        ✓ Acknowledge
                                                    </button>
                                                )}
                                            </td>
                                            <td>
                                                {openClar ? (
                                                    <span className="nw-tag danger" title={openClar.question}>
                                                        ❓ Question Open
                                                    </span>
                                                ) : resolvedClar ? (
                                                    <span className="nw-tag success" title={`Dr: ${resolvedClar.responseText}`}>
                                                        ✓ Clarified
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                                                )}
                                            </td>
                                            <td><span className={`nw-status-pill ${(o.status || '').toLowerCase()}`}>{o.status}</span></td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="nw-mini-btn outline"
                                                    onClick={() => setClarificationModal({
                                                        open: true,
                                                        order: o,
                                                        issueType: 'DOSAGE_CONFIRMATION',
                                                        question: ''
                                                    })}
                                                    title="Ask Doctor Clarification regarding this order"
                                                >
                                                    ❓ Clarify
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // 3. VITALS TAB (Append-only)
    const renderVitals = () => (
        <div className="nw-section">
            <h2 className="nw-section-title">📊 Record New Vitals (Append-Only)</h2>
            <form onSubmit={handleRecordVitals}>
                <div className="nw-form-grid">
                    <div className="nw-form-group">
                        <label>Systolic BP (mmHg)</label>
                        <input type="number" min="40" max="300" placeholder="e.g. 120" value={vitalsForm.systolicBP} onChange={e => setVitalsForm(p => ({ ...p, systolicBP: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Diastolic BP (mmHg)</label>
                        <input type="number" min="20" max="200" placeholder="e.g. 80" value={vitalsForm.diastolicBP} onChange={e => setVitalsForm(p => ({ ...p, diastolicBP: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Heart Rate (bpm)</label>
                        <input type="number" min="20" max="250" placeholder="e.g. 72" value={vitalsForm.pulse} onChange={e => setVitalsForm(p => ({ ...p, pulse: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Temperature (°F)</label>
                        <input type="number" min="90" max="110" step="0.1" placeholder="e.g. 98.6" value={vitalsForm.temperature} onChange={e => setVitalsForm(p => ({ ...p, temperature: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>SpO₂ (%)</label>
                        <input type="number" min="50" max="100" placeholder="e.g. 98" value={vitalsForm.spo2} onChange={e => setVitalsForm(p => ({ ...p, spo2: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Respiratory Rate (/min)</label>
                        <input type="number" min="5" max="60" placeholder="e.g. 16" value={vitalsForm.respiratoryRate} onChange={e => setVitalsForm(p => ({ ...p, respiratoryRate: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Pain Score (0-10)</label>
                        <input type="number" min="0" max="10" placeholder="0-10" value={vitalsForm.painScore} onChange={e => setVitalsForm(p => ({ ...p, painScore: e.target.value }))} />
                    </div>
                    <div className="nw-form-group full-width">
                        <label>Clinical Notes</label>
                        <textarea placeholder="Observation notes..." rows={2} value={vitalsForm.notes} onChange={e => setVitalsForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                </div>
                <div className="nw-submit-row">
                    <button type="button" className="nw-btn secondary" onClick={() => setVitalsForm(VITALS_INIT)}>Clear</button>
                    <button type="submit" className="nw-btn primary" disabled={submitting}>
                        {submitting ? 'Saving...' : '💾 Record Vitals'}
                    </button>
                </div>
            </form>

            <div className="nw-table-wrapper" style={{ marginTop: '24px' }}>
                <div className="nw-table-header">
                    <h3>🕐 Vitals History (Immutable Log)</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{vitalsHistory.length} record{vitalsHistory.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.vitals ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading vitals...</div>
                ) : vitalsHistory.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No vitals recorded yet.</div>
                ) : (
                    <div className="nw-table-scroll">
                        <table className="nw-table">
                            <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>BP</th>
                                    <th>Pulse</th>
                                    <th>SpO₂</th>
                                    <th>Temp</th>
                                    <th>RR</th>
                                    <th>Pain</th>
                                    <th>Recorded By</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vitalsHistory.map(v => (
                                    <tr key={v._id}>
                                        <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                            {new Date(v.recordedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td>{v.systolicBP ? `${v.systolicBP}/${v.diastolicBP || '?'}` : '—'}</td>
                                        <td>{v.pulse || '—'}</td>
                                        <td style={{ color: v.spo2 && v.spo2 < 90 ? '#dc2626' : v.spo2 && v.spo2 < 95 ? '#d97706' : 'inherit', fontWeight: v.spo2 && v.spo2 < 95 ? 700 : 400 }}>
                                            {v.spo2 ? `${v.spo2}%` : '—'}
                                        </td>
                                        <td>{v.temperature ? `${v.temperature}°F` : '—'}</td>
                                        <td>{v.respiratoryRate || '—'}</td>
                                        <td>{v.painScore !== undefined && v.painScore !== null ? `${v.painScore}/10` : '—'}</td>
                                        <td style={{ fontSize: '0.78rem' }}>{typeof v.recordedBy === 'object' ? (v.recordedBy?.name || '—') : '—'}</td>
                                        <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{v.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // 4. MAR TAB
    const renderMAR = () => (
        <div className="nw-section">
            <div className="nw-table-wrapper">
                <div className="nw-table-header">
                    <h3>💊 Medication Administration Record (MAR)</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{marRecords.length} record{marRecords.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.mar ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading MAR...</div>
                ) : marRecords.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No MAR scheduled records.</div>
                ) : (
                    <div className="nw-table-scroll">
                        <table className="nw-table">
                            <thead>
                                <tr>
                                    <th>Medication</th>
                                    <th>Dosage</th>
                                    <th>Route</th>
                                    <th>Scheduled</th>
                                    <th>Status</th>
                                    <th>Administered</th>
                                    <th>By</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marRecords.map(m => {
                                    const orderInfo = typeof m.orderId === 'object' ? m.orderId : null;
                                    const isActionable = ['SCHEDULED', 'DUE'].includes(m.status);
                                    return (
                                        <tr key={m._id}>
                                            <td style={{ fontWeight: 600 }}>{orderInfo?.medicineName || '—'}</td>
                                            <td>{orderInfo ? `${orderInfo.dosageValue || ''} ${orderInfo.dosageUnit || ''}`.trim() || '—' : '—'}</td>
                                            <td>{orderInfo?.route || '—'}</td>
                                            <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                                {new Date(m.scheduledTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td><span className={`nw-status-pill ${(m.status || '').toLowerCase()}`}>{m.status}</span></td>
                                            <td style={{ fontSize: '0.78rem' }}>
                                                {m.administeredTime ? new Date(m.administeredTime).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td style={{ fontSize: '0.78rem' }}>{typeof m.administeredBy === 'object' ? (m.administeredBy?.name || '—') : '—'}</td>
                                            <td>
                                                {isActionable ? (
                                                    <div className="nw-mar-actions">
                                                        <button className="nw-mar-btn give" onClick={() => openMARModal(m, 'ADMINISTERED')} disabled={submitting}>✓ Give</button>
                                                        <button className="nw-mar-btn hold" onClick={() => openMARModal(m, 'HELD')} disabled={submitting}>⏸ Hold</button>
                                                        <button className="nw-mar-btn refuse" onClick={() => openMARModal(m, 'REFUSED')} disabled={submitting}>✗ Refuse</button>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // 5. NURSING NOTES TAB (Append-only)
    const renderNotes = () => (
        <div className="nw-section">
            <h2 className="nw-section-title">📝 Add Clinical Nursing Note (Append-Only)</h2>
            <form onSubmit={handleAddNote}>
                <div className="nw-form-grid">
                    <div className="nw-form-group">
                        <label>Note Type *</label>
                        <select value={noteForm.noteType} onChange={e => setNoteForm(p => ({ ...p, noteType: e.target.value }))}>
                            <option value="GENERAL">General</option>
                            <option value="PATIENT_CONDITION">Patient Condition</option>
                            <option value="OBSERVATION">Observation</option>
                            <option value="MEDICATION">Medication Assessment</option>
                            <option value="POST_OP">Post-Op Care</option>
                            <option value="WOUND">Wound / Dressing</option>
                            <option value="SAFETY">Safety / Fall Risk</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Priority</label>
                        <select value={noteForm.priority} onChange={e => setNoteForm(p => ({ ...p, priority: e.target.value }))}>
                            <option value="Normal">Normal</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Shift</label>
                        <select value={noteForm.shift} onChange={e => setNoteForm(p => ({ ...p, shift: e.target.value }))}>
                            <option value="Morning">Morning</option>
                            <option value="Evening">Evening</option>
                            <option value="Night">Night</option>
                            <option value="General">General</option>
                        </select>
                    </div>
                    <div className="nw-form-group full-width">
                        <label>Note Content *</label>
                        <textarea placeholder="Enter detailed nursing observations, condition changes, patient responses..." rows={3} value={noteForm.note} onChange={e => setNoteForm(p => ({ ...p, note: e.target.value }))} />
                    </div>
                </div>
                <div className="nw-submit-row">
                    <button type="submit" className="nw-btn primary" disabled={submitting}>
                        {submitting ? 'Saving...' : '💾 Save Nursing Note'}
                    </button>
                </div>
            </form>

            <div className="nw-table-wrapper" style={{ marginTop: '24px' }}>
                <div className="nw-table-header">
                    <h3>📜 Nursing Notes History (Immutable Audit Log)</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.notes ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading notes...</div>
                ) : notes.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No nursing notes recorded yet.</div>
                ) : (
                    <div className="nw-notes-list">
                        {notes.map(n => (
                            <div className="nw-note-card" key={n._id}>
                                <div className="nw-note-header">
                                    <div className="nw-note-meta">
                                        <span className="nw-note-type-badge">{n.noteType}</span>
                                        <span className={`nw-note-priority ${n.priority?.toLowerCase()}`}>{n.priority}</span>
                                        {n.shift && <span className="nw-note-shift">Shift: {n.shift}</span>}
                                    </div>
                                    <div className="nw-note-author">
                                        <span>Nurse: {typeof n.nurseId === 'object' ? (n.nurseId?.name || 'Staff') : 'Staff'}</span> •
                                        <span>{new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                                <div className="nw-note-body">{n.note}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // 6. TASKS TAB
    const renderTasks = () => {
        const filteredTasks = tasks.filter(t => taskFilter === 'ALL' || t.status === taskFilter);
        return (
            <div className="nw-section">
                <div className="nw-section-header">
                    <div>
                        <h2 className="nw-section-title" style={{ margin: 0 }}>✅ Nursing Tasks Management</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div className="nw-filter-tabs">
                            {['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'].map(f => (
                                <button key={f} className={`nw-filter-btn ${taskFilter === f ? 'active' : ''}`} onClick={() => setTaskFilter(f)}>
                                    {f}
                                </button>
                            ))}
                        </div>
                        <button className="nw-btn primary small" onClick={() => setNewTaskModalOpen(true)}>
                            <FiPlus size={14} /> Schedule Task
                        </button>
                    </div>
                </div>

                {loading.tasks ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading tasks...</div>
                ) : filteredTasks.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No tasks found for the selected filter.</div>
                ) : (
                    <div className="nw-tasks-grid">
                        {filteredTasks.map(t => (
                            <div className={`nw-task-card ${t.status.toLowerCase()}`} key={t._id}>
                                <div className="nw-task-card-header">
                                    <span className="nw-task-type">{t.taskType}</span>
                                    <span className={`nw-task-priority ${t.priority.toLowerCase()}`}>{t.priority}</span>
                                    <span className={`nw-status-pill ${t.status.toLowerCase()}`}>{t.status}</span>
                                </div>
                                <h4 className="nw-task-title">{t.title}</h4>
                                {t.description && <p className="nw-task-desc">{t.description}</p>}
                                <div className="nw-task-meta">
                                    <span>Scheduled: {t.scheduledAt ? new Date(t.scheduledAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ASAP'}</span>
                                    {t.assignedTo && <span>Assigned: {typeof t.assignedTo === 'object' ? t.assignedTo?.name : 'Nurse'}</span>}
                                </div>
                                {t.notes && <div className="nw-task-notes">📝 {t.notes}</div>}
                                {t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                                    <div className="nw-task-actions">
                                        {t.status === 'PENDING' && (
                                            <button className="nw-task-act-btn start" onClick={() => handleUpdateTaskStatusDirect(t, 'IN_PROGRESS')}>
                                                ▶ Start
                                            </button>
                                        )}
                                        <button className="nw-task-act-btn complete" onClick={() => setTaskModal({ open: true, task: t, action: 'COMPLETED', notes: '' })}>
                                            ✓ Complete
                                        </button>
                                        <button className="nw-task-act-btn skip" onClick={() => setTaskModal({ open: true, task: t, action: 'SKIPPED', notes: '' })}>
                                            ⏭ Skip
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const handleUpdateTaskStatusDirect = async (task, newStatus) => {
        try {
            setSubmitting(true);
            await nursingTaskAPI.updateTask(task._id, { status: newStatus });
            showToast(`Task moved to ${newStatus}`);
            fetchTasks();
            fetchTimeline();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error updating task', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // 7. INTAKE / OUTPUT TAB
    const renderIO = () => (
        <div className="nw-section">
            <h2 className="nw-section-title">💧 Fluid Balance & Intake / Output Tracking (24-Hour)</h2>
            <div className="nw-io-summary-grid">
                <div className="nw-io-stat-card intake">
                    <span className="nw-io-stat-lbl">Total Intake</span>
                    <span className="nw-io-stat-val">+{ioSummary?.totalIntakeMl || 0} ml</span>
                </div>
                <div className="nw-io-stat-card output">
                    <span className="nw-io-stat-lbl">Total Output</span>
                    <span className="nw-io-stat-val">-{ioSummary?.totalOutputMl || 0} ml</span>
                </div>
                <div className="nw-io-stat-card balance">
                    <span className="nw-io-stat-lbl">Net Balance</span>
                    <span className="nw-io-stat-val" style={{ color: (ioSummary?.netBalanceMl || 0) < 0 ? '#dc2626' : '#059669' }}>
                        {ioSummary ? `${ioSummary.netBalanceMl > 0 ? '+' : ''}${ioSummary.netBalanceMl} ml` : '0 ml'}
                    </span>
                </div>
            </div>

            <form onSubmit={handleRecordIO} style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '12px', color: '#1e293b' }}>Record Fluid Entry</h3>
                <div className="nw-form-grid">
                    <div className="nw-form-group">
                        <label>Category *</label>
                        <select value={ioForm.category} onChange={e => {
                            const cat = e.target.value;
                            setIoForm(p => ({
                                ...p,
                                category: cat,
                                type: cat === 'INTAKE' ? 'Oral' : 'Urine'
                            }));
                        }}>
                            <option value="INTAKE">Intake (Fluid In)</option>
                            <option value="OUTPUT">Output (Fluid Out)</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Type *</label>
                        {ioForm.category === 'INTAKE' ? (
                            <select value={ioForm.type} onChange={e => setIoForm(p => ({ ...p, type: e.target.value }))}>
                                <option value="Oral">Oral (Water / Soup)</option>
                                <option value="IV">IV Infusion / Fluids</option>
                                <option value="Tube Feed">Tube Feed (NG/PEG)</option>
                                <option value="Blood">Blood / Blood Products</option>
                                <option value="Other">Other</option>
                            </select>
                        ) : (
                            <select value={ioForm.type} onChange={e => setIoForm(p => ({ ...p, type: e.target.value }))}>
                                <option value="Urine">Urine</option>
                                <option value="Drain">Surgical Drain</option>
                                <option value="Vomit">Vomit / Emesis</option>
                                <option value="Stool">Stool / Diarrhea</option>
                                <option value="NG Suction">NG Suction</option>
                                <option value="Other">Other</option>
                            </select>
                        )}
                    </div>
                    <div className="nw-form-group">
                        <label>Amount *</label>
                        <input type="number" step="0.1" min="1" placeholder="e.g. 250" value={ioForm.amount} onChange={e => setIoForm(p => ({ ...p, amount: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Unit</label>
                        <select value={ioForm.unit} onChange={e => setIoForm(p => ({ ...p, unit: e.target.value }))}>
                            <option value="ml">ml (milliliters)</option>
                            <option value="L">L (liters)</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Source / Site</label>
                        <input type="text" placeholder="e.g. RL 500ml, Jackson-Pratt #1" value={ioForm.source} onChange={e => setIoForm(p => ({ ...p, source: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Notes</label>
                        <input type="text" placeholder="Color, clarity, remarks..." value={ioForm.notes} onChange={e => setIoForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                </div>
                <div className="nw-submit-row">
                    <button type="submit" className="nw-btn primary" disabled={submitting}>
                        {submitting ? 'Saving...' : '💾 Record Fluid Entry'}
                    </button>
                </div>
            </form>

            <div className="nw-table-wrapper" style={{ marginTop: '24px' }}>
                <div className="nw-table-header">
                    <h3>💧 Fluid Entry Log</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{ioRecords.length} record{ioRecords.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.io ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading fluid records...</div>
                ) : ioRecords.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No fluid records logged yet.</div>
                ) : (
                    <div className="nw-table-scroll">
                        <table className="nw-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Category</th>
                                    <th>Type</th>
                                    <th>Amount</th>
                                    <th>Source / Details</th>
                                    <th>Recorded By</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ioRecords.map(r => (
                                    <tr key={r._id}>
                                        <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                            {new Date(r.recordedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td>
                                            <span className={`nw-io-tag ${r.category.toLowerCase()}`}>
                                                {r.category === 'INTAKE' ? '↓ Intake' : '↑ Output'}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{r.type}</td>
                                        <td style={{ fontWeight: 600, color: r.category === 'INTAKE' ? '#059669' : '#dc2626' }}>
                                            {r.category === 'INTAKE' ? '+' : '-'}{r.amount} {r.unit}
                                        </td>
                                        <td style={{ fontSize: '0.78rem' }}>{r.source || '—'}</td>
                                        <td style={{ fontSize: '0.78rem' }}>{typeof r.recordedBy === 'object' ? (r.recordedBy?.name || '—') : '—'}</td>
                                        <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{r.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // 8. LINES & CATHETERS TAB
    const renderLines = () => (
        <div className="nw-section">
            <div className="nw-section-header">
                <h2 className="nw-section-title" style={{ margin: 0 }}>🔌 Vascular Access Lines & Catheter Life-cycle</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="nw-btn primary small" onClick={() => setNewLineModalOpen(true)}>
                        <FiPlus size={14} /> Insert Line / Cannula
                    </button>
                    <button className="nw-btn secondary small" onClick={() => setNewCathModalOpen(true)}>
                        <FiPlus size={14} /> Insert Catheter
                    </button>
                </div>
            </div>

            <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '0.96rem', marginBottom: '12px', color: '#334155' }}>Active Invasive Devices</h3>
                {activeLines.length === 0 && activeCatheters.length === 0 ? (
                    <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>
                        No active lines or catheters.
                    </div>
                ) : (
                    <div className="nw-devices-grid">
                        {activeLines.map(l => (
                            <div className="nw-device-card active" key={l._id}>
                                <div className="nw-device-card-head">
                                    <span className="nw-device-badge line">IV LINE</span>
                                    <span className="nw-device-status">ACTIVE</span>
                                </div>
                                <h4>{l.lineType.replace('_', ' ')}</h4>
                                <div className="nw-device-detail"><strong>Site:</strong> {l.site} {l.gauge ? `(${l.gauge})` : ''}</div>
                                <div className="nw-device-detail"><strong>Inserted:</strong> {new Date(l.insertedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                {l.notes && <div className="nw-device-detail"><strong>Notes:</strong> {l.notes}</div>}
                                <button className="nw-device-remove-btn" onClick={() => setDeviceRemoveModal({ open: true, type: 'LINE', id: l._id, reason: 'Routine / Discharged', notes: '' })}>
                                    Remove Line
                                </button>
                            </div>
                        ))}
                        {activeCatheters.map(c => (
                            <div className="nw-device-card active" key={c._id}>
                                <div className="nw-device-card-head">
                                    <span className="nw-device-badge cath">CATHETER</span>
                                    <span className="nw-device-status">ACTIVE</span>
                                </div>
                                <h4>{c.catheterType} Catheter</h4>
                                <div className="nw-device-detail"><strong>Size:</strong> {c.size || 'Standard'} • {c.site || 'Urethral'}</div>
                                <div className="nw-device-detail"><strong>Inserted:</strong> {new Date(c.insertedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                {c.notes && <div className="nw-device-detail"><strong>Notes:</strong> {c.notes}</div>}
                                <button className="nw-device-remove-btn" onClick={() => setDeviceRemoveModal({ open: true, type: 'CATHETER', id: c._id, reason: 'Routine / Discharged', notes: '' })}>
                                    Remove Catheter
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="nw-table-wrapper" style={{ marginTop: '28px' }}>
                <div className="nw-table-header">
                    <h3>📜 Device History Log (Past Insertions & Removals)</h3>
                </div>
                <div className="nw-table-scroll">
                    <table className="nw-table">
                        <thead>
                            <tr>
                                <th>Device</th>
                                <th>Type / Site</th>
                                <th>Inserted At</th>
                                <th>Status</th>
                                <th>Removed At</th>
                                <th>Removal Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...lines.map(l => ({ ...l, deviceKind: 'Line' })), ...catheters.map(c => ({ ...c, deviceKind: 'Catheter' }))].map(d => (
                                <tr key={d._id}>
                                    <td style={{ fontWeight: 600 }}>{d.deviceKind}</td>
                                    <td>{d.lineType || d.catheterType} • {d.site || '—'}</td>
                                    <td style={{ fontSize: '0.78rem' }}>{new Date(d.insertedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                    <td><span className={`nw-status-pill ${d.status.toLowerCase()}`}>{d.status}</span></td>
                                    <td style={{ fontSize: '0.78rem' }}>{d.removedAt ? new Date(d.removedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{d.removalReason || d.notes || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    // 9. WOUND CARE TAB
    const renderWoundCare = () => (
        <div className="nw-section">
            <h2 className="nw-section-title">🩹 Wound & Surgical Dressing Management (Append-Only)</h2>
            <form onSubmit={handleRecordWound}>
                <div className="nw-form-grid">
                    <div className="nw-form-group">
                        <label>Wound Site *</label>
                        <input type="text" placeholder="e.g. Abdominal Midline, Sacral Ulcer" value={woundForm.woundSite} onChange={e => setWoundForm(p => ({ ...p, woundSite: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Wound Type</label>
                        <select value={woundForm.woundType} onChange={e => setWoundForm(p => ({ ...p, woundType: e.target.value }))}>
                            <option value="Surgical">Surgical Incision</option>
                            <option value="Pressure Ulcer">Pressure Ulcer</option>
                            <option value="Trauma">Trauma / Laceration</option>
                            <option value="Burn">Burn</option>
                            <option value="Diabetic">Diabetic Foot</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Wound Bed Condition</label>
                        <select value={woundForm.condition} onChange={e => setWoundForm(p => ({ ...p, condition: e.target.value }))}>
                            <option value="Clean">Clean / Healthy</option>
                            <option value="Granulating">Granulating</option>
                            <option value="Epithelializing">Epithelializing</option>
                            <option value="Exudate">Exudative</option>
                            <option value="Slough">Slough Present</option>
                            <option value="Infected">Infected / Inflamed</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Dressing Applied</label>
                        <select value={woundForm.dressingType} onChange={e => setWoundForm(p => ({ ...p, dressingType: e.target.value }))}>
                            <option value="Gauze">Sterile Gauze & Tape</option>
                            <option value="Hydrocolloid">Hydrocolloid</option>
                            <option value="Foam">Foam Dressing</option>
                            <option value="Transparent Film">Transparent Film</option>
                            <option value="Silver">Silver Antimicrobial</option>
                            <option value="Negative Pressure">NPWT / VAC</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Drainage Amount</label>
                        <select value={woundForm.drainageAmount} onChange={e => setWoundForm(p => ({ ...p, drainageAmount: e.target.value }))}>
                            <option value="None">None</option>
                            <option value="Minimal">Minimal</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Heavy">Heavy</option>
                        </select>
                    </div>
                    <div className="nw-form-group">
                        <label>Drainage Type</label>
                        <select value={woundForm.drainageType} onChange={e => setWoundForm(p => ({ ...p, drainageType: e.target.value }))}>
                            <option value="">None / Not Applicable</option>
                            <option value="Serous">Serous (Clear / Straw)</option>
                            <option value="Sanguineous">Sanguineous (Bloody)</option>
                            <option value="Serosanguineous">Serosanguineous (Pink)</option>
                            <option value="Purulent">Purulent (Thick / Cloudy)</option>
                        </select>
                    </div>
                    <div className="nw-form-group full-width">
                        <label>Clinical Notes</label>
                        <textarea placeholder="Wound dimensions, odor, peri-wound skin condition..." rows={2} value={woundForm.notes} onChange={e => setWoundForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                </div>
                <div className="nw-submit-row">
                    <button type="submit" className="nw-btn primary" disabled={submitting}>
                        {submitting ? 'Saving...' : '💾 Record Dressing Change'}
                    </button>
                </div>
            </form>

            <div className="nw-table-wrapper" style={{ marginTop: '24px' }}>
                <div className="nw-table-header">
                    <h3>📜 Dressing Changes History Log</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{woundRecords.length} record{woundRecords.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.wound ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading wound care log...</div>
                ) : woundRecords.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No dressing changes recorded yet.</div>
                ) : (
                    <div className="nw-table-scroll">
                        <table className="nw-table">
                            <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Wound Site</th>
                                    <th>Type</th>
                                    <th>Condition</th>
                                    <th>Dressing</th>
                                    <th>Drainage</th>
                                    <th>Changed By</th>
                                    <th>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {woundRecords.map(w => (
                                    <tr key={w._id}>
                                        <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                            {new Date(w.dressingChangedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>{w.woundSite}</td>
                                        <td>{w.woundType}</td>
                                        <td><span className="nw-wound-condition-tag">{w.condition}</span></td>
                                        <td>{w.dressingType}</td>
                                        <td style={{ fontSize: '0.78rem' }}>{w.drainageAmount ? `${w.drainageAmount} ${w.drainageType}` : 'None'}</td>
                                        <td style={{ fontSize: '0.78rem' }}>{typeof w.dressingChangedBy === 'object' ? (w.dressingChangedBy?.name || '—') : '—'}</td>
                                        <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{w.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // 10. INVESTIGATIONS TAB (Reused LabReport & Vial)
    const renderInvestigations = () => (
        <div className="nw-section">
            <div className="nw-table-wrapper">
                <div className="nw-table-header">
                    <h3>🔬 Diagnostic Investigations & Lab Reports</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{investigations.length} investigation{investigations.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.investigations ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading investigations...</div>
                ) : investigations.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No laboratory investigations ordered for this patient.</div>
                ) : (
                    <div className="nw-table-scroll">
                        <table className="nw-table">
                            <thead>
                                <tr>
                                    <th>Test / Panel</th>
                                    <th>Ordered Date</th>
                                    <th>Workflow Stage</th>
                                    <th>Lab Status</th>
                                    <th>Report Status</th>
                                    <th>Report File</th>
                                </tr>
                            </thead>
                            <tbody>
                                {investigations.map(inv => (
                                    <tr key={inv.id}>
                                        <td style={{ fontWeight: 600 }}>{(inv.testNames || []).join(', ') || 'Diagnostic Panel'}</td>
                                        <td style={{ fontSize: '0.78rem' }}>
                                            {new Date(inv.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td>
                                            <span className={`nw-stage-pill ${inv.stage.toLowerCase()}`}>
                                                {inv.stage.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td><span className={`nw-status-pill ${inv.testStatus.toLowerCase()}`}>{inv.testStatus}</span></td>
                                        <td><span className={`nw-status-pill ${inv.reportStatus.toLowerCase()}`}>{inv.reportStatus}</span></td>
                                        <td>
                                            {inv.reportFile?.url ? (
                                                <a href={inv.reportFile.url} target="_blank" rel="noreferrer" className="nw-report-link">
                                                    📄 View Report
                                                </a>
                                            ) : (
                                                <span style={{ color: '#94a3b8', fontSize: '0.76rem' }}>Pending Upload</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );

    // 11. SHIFT HANDOVER TAB (Append-only)
    const renderHandover = () => (
        <div className="nw-section">
            <h2 className="nw-section-title">🤝 Shift-to-Shift Clinical Handover (SBAR Format)</h2>
            <form onSubmit={handleSaveHandover}>
                <div className="nw-form-grid">
                    <div className="nw-form-group">
                        <label>Shift Transition *</label>
                        <select value={handoverForm.shift} onChange={e => setHandoverForm(p => ({ ...p, shift: e.target.value }))}>
                            <option value="Morning to Evening">Morning ➔ Evening Shift</option>
                            <option value="Evening to Night">Evening ➔ Night Shift</option>
                            <option value="Night to Morning">Night ➔ Morning Shift</option>
                            <option value="Emergency Handover">Emergency Handover</option>
                        </select>
                    </div>
                    <div className="nw-form-group full-width">
                        <label>Patient Condition Summary *</label>
                        <textarea placeholder="Current patient stability, general overview, diagnosis, treatment progress..." rows={2} value={handoverForm.summary} onChange={e => setHandoverForm(p => ({ ...p, summary: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Important Observations</label>
                        <textarea placeholder="Unusual vitals, mental state, pain, diet tolerance..." rows={2} value={handoverForm.importantObservations} onChange={e => setHandoverForm(p => ({ ...p, importantObservations: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Pending Tasks</label>
                        <textarea placeholder="Pending labs, dressing changes, pending scans..." rows={2} value={handoverForm.pendingTasks} onChange={e => setHandoverForm(p => ({ ...p, pendingTasks: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Medication Concerns</label>
                        <textarea placeholder="Held meds, adverse reactions, titrations..." rows={2} value={handoverForm.medicationConcerns} onChange={e => setHandoverForm(p => ({ ...p, medicationConcerns: e.target.value }))} />
                    </div>
                    <div className="nw-form-group">
                        <label>Safety Concerns</label>
                        <textarea placeholder="Fall risk, allergy alerts, agitation, lines..." rows={2} value={handoverForm.safetyConcerns} onChange={e => setHandoverForm(p => ({ ...p, safetyConcerns: e.target.value }))} />
                    </div>
                </div>
                <div className="nw-submit-row">
                    <button type="submit" className="nw-btn primary" disabled={submitting}>
                        {submitting ? 'Saving...' : '💾 Submit Shift Handover'}
                    </button>
                </div>
            </form>

            <div className="nw-table-wrapper" style={{ marginTop: '24px' }}>
                <div className="nw-table-header">
                    <h3>📜 Shift Handover History (Immutable Audit Log)</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{handovers.length} handover{handovers.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.handover ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading handovers...</div>
                ) : handovers.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No shift handovers logged yet.</div>
                ) : (
                    <div className="nw-notes-list">
                        {handovers.map(h => (
                            <div className="nw-note-card handover" key={h._id}>
                                <div className="nw-note-header">
                                    <div className="nw-note-meta">
                                        <span className="nw-handover-shift-badge">{h.shift}</span>
                                    </div>
                                    <div className="nw-note-author">
                                        <span>Handed over by: {typeof h.fromNurseId === 'object' ? (h.fromNurseId?.name || 'Nurse') : 'Nurse'}</span> •
                                        <span>{new Date(h.handoverAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                </div>
                                <div className="nw-handover-section"><strong>Summary:</strong> {h.summary}</div>
                                {h.importantObservations && <div className="nw-handover-section"><strong>Observations:</strong> {h.importantObservations}</div>}
                                {h.pendingTasks && <div className="nw-handover-section"><strong>Pending Tasks:</strong> {h.pendingTasks}</div>}
                                {h.medicationConcerns && <div className="nw-handover-section"><strong>Medication Concerns:</strong> {h.medicationConcerns}</div>}
                                {h.safetyConcerns && <div className="nw-handover-section alert"><strong>⚠️ Safety Concerns:</strong> {h.safetyConcerns}</div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // 12. OT & POST-OP TAB (Reusing SurgeryPlan)
    const renderOT = () => (
        <div className="nw-section">
            <div className="nw-table-wrapper">
                <div className="nw-table-header">
                    <h3>✂️ Operation Theatre & Post-Op Tracking</h3>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{otPlans.length} procedure{otPlans.length !== 1 ? 's' : ''}</span>
                </div>
                {loading.ot ? (
                    <div className="nw-loading"><div className="nw-spinner" /> Loading OT records...</div>
                ) : otPlans.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No OT surgical plans linked to this patient.</div>
                ) : (
                    <div className="nw-ot-plans-list">
                        {otPlans.map(plan => (
                            <div className="nw-ot-card" key={plan._id}>
                                <div className="nw-ot-card-head">
                                    <div>
                                        <h4>{plan.surgery}</h4>
                                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Diagnosis: {plan.diagnosis || '—'}</div>
                                    </div>
                                    <span className={`nw-status-pill ${plan.status.toLowerCase()}`}>{plan.status}</span>
                                </div>
                                <div className="nw-ot-grid">
                                    <div><strong>Surgeon:</strong> {typeof plan.surgeonId === 'object' ? `Dr. ${plan.surgeonId.name}` : 'Surgeon'}</div>
                                    <div><strong>Priority:</strong> {plan.priority}</div>
                                    <div><strong>Date:</strong> {new Date(plan.preferredDate || plan.surgeryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                    <div><strong>Time:</strong> {plan.preferredTime || plan.startTime || '—'}</div>
                                    <div><strong>Pre-Op Required:</strong> {plan.preOpRequired ? 'Yes' : 'No'}</div>
                                    <div><strong>Post-Op Notes:</strong> {plan.notes || 'Routine recovery monitoring'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // 13. DISCHARGE READINESS TAB (Phase 6 Workflow)
    const renderDischargeReadiness = () => {
        const r = dischargeReadiness || {};
        const isDocOrdered = !!r.doctorDischargeOrdered;
        const isNurseDone = !!r.nursingClearance;
        const activeLinesCnt = r.activeLinesCount !== undefined ? r.activeLinesCount : activeLines.length;
        const activeCathsCnt = r.activeCathetersCount !== undefined ? r.activeCathetersCount : activeCatheters.length;
        const dueMAR = r.dueMARCount || 0;
        const pendingTasksCnt = r.pendingTasksCount || 0;

        return (
            <div className="nw-section">
                <div className="nw-discharge-banner">
                    <div className="nw-discharge-banner-main">
                        <div className="nw-discharge-status-icon">
                            {r.overallStatus === 'READY_FOR_DISCHARGE' ? <FiCheckCircle size={32} color="#16a34a" /> : <FiClock size={32} color="#0d9488" />}
                        </div>
                        <div>
                            <h2>Discharge Readiness & Clinical Clearance</h2>
                            <p>Status: <strong className={`nw-readiness-badge ${String(r.overallStatus || 'NOT_READY').toLowerCase()}`}>{r.overallStatus || 'NOT READY'}</strong></p>
                        </div>
                    </div>
                    <div>
                        {!isNurseDone ? (
                            <button className="nw-btn primary" onClick={() => setClearanceModalOpen(true)}>
                                <FiCheckSquare size={16} /> Sign Off Nursing Clearance
                            </button>
                        ) : (
                            <div className="nw-cleared-pill">
                                <FiCheckCircle size={16} /> Nursing Cleared by {r.nursingClearedNurse?.name || 'Staff Nurse'}
                            </div>
                        )}
                    </div>
                </div>

                <div className="nw-discharge-steps">
                    {/* Stage 1: Doctor Order */}
                    <div className={`nw-step-card ${isDocOrdered ? 'complete' : 'pending'}`}>
                        <div className="nw-step-header">
                            <span className="nw-step-num">1</span>
                            <h3>Doctor Discharge Order</h3>
                            <span className={`nw-status-pill ${isDocOrdered ? 'active' : 'pending'}`}>
                                {isDocOrdered ? 'Ordered' : 'Awaiting Doctor'}
                            </span>
                        </div>
                        <div className="nw-step-body">
                            {isDocOrdered ? (
                                <>
                                    <div className="nw-step-info">
                                        <strong>Ordered By:</strong> {r.doctorDischargeDoctor?.name ? `Dr. ${r.doctorDischargeDoctor.name}` : 'Attending Physician'}
                                    </div>
                                    <div className="nw-step-info">
                                        <strong>Ordered Date:</strong> {r.doctorDischargeDate ? new Date(r.doctorDischargeDate).toLocaleString('en-IN') : 'Recently'}
                                    </div>
                                    {r.doctorDischargeNotes && (
                                        <div className="nw-step-note">
                                            <strong>Discharge Plan / Instructions:</strong> {r.doctorDischargeNotes}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="nw-step-placeholder">Doctor has not submitted discharge order yet. Inpatient orders and clinical monitoring remain active.</p>
                            )}
                        </div>
                    </div>

                    {/* Stage 2: Nursing Clinical Clearance & Device Safety */}
                    <div className={`nw-step-card ${isNurseDone ? 'complete' : (activeLinesCnt > 0 || activeCathsCnt > 0 ? 'warning' : 'in-progress')}`}>
                        <div className="nw-step-header">
                            <span className="nw-step-num">2</span>
                            <h3>Nursing Clinical Clearance</h3>
                            <span className={`nw-status-pill ${isNurseDone ? 'active' : 'pending'}`}>
                                {isNurseDone ? 'Cleared' : 'Pending Sign-off'}
                            </span>
                        </div>
                        <div className="nw-step-body">
                            <div className="nw-checklist-items">
                                <div className={`nw-check-item ${activeLinesCnt === 0 ? 'pass' : 'fail'}`}>
                                    <span>{activeLinesCnt === 0 ? '✓' : '⚠️'} Vascular Lines / Cannulas Removed:</span>
                                    <strong>{activeLinesCnt === 0 ? '0 Active (Safe)' : `${activeLinesCnt} Active (Must Remove)`}</strong>
                                </div>
                                <div className={`nw-check-item ${activeCathsCnt === 0 ? 'pass' : 'fail'}`}>
                                    <span>{activeCathsCnt === 0 ? '✓' : '⚠️'} Urinary / Foley Catheters Removed:</span>
                                    <strong>{activeCathsCnt === 0 ? '0 Active (Safe)' : `${activeCathsCnt} Active (Must Remove)`}</strong>
                                </div>
                                <div className={`nw-check-item ${dueMAR === 0 ? 'pass' : 'fail'}`}>
                                    <span>{dueMAR === 0 ? '✓' : 'ℹ️'} MAR Medications Reconciled:</span>
                                    <strong>{dueMAR === 0 ? 'All doses reconciled' : `${dueMAR} doses scheduled`}</strong>
                                </div>
                                <div className={`nw-check-item ${pendingTasksCnt === 0 ? 'pass' : 'neutral'}`}>
                                    <span>{pendingTasksCnt === 0 ? '✓' : 'ℹ️'} Nursing Tasks Completed:</span>
                                    <strong>{pendingTasksCnt === 0 ? 'All tasks complete' : `${pendingTasksCnt} tasks remaining`}</strong>
                                </div>
                            </div>

                            {isNurseDone ? (
                                <div className="nw-step-cleared-info">
                                    <div><strong>Cleared At:</strong> {r.nursingClearedAt ? new Date(r.nursingClearedAt).toLocaleString('en-IN') : '—'}</div>
                                    <div><strong>Nurse Notes:</strong> {r.nursingNotes || 'Patient clinically stable for discharge.'}</div>
                                </div>
                            ) : (
                                <div style={{ marginTop: '12px' }}>
                                    <button className="nw-btn primary small" onClick={() => setClearanceModalOpen(true)}>
                                        Complete & Sign Off Nursing Clearance
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Stage 3: Lab & Diagnostics */}
                    <div className="nw-step-card complete">
                        <div className="nw-step-header">
                            <span className="nw-step-num">3</span>
                            <h3>Diagnostic Investigations</h3>
                            <span className="nw-status-pill active">
                                {r.pendingInvestigationsCount > 0 ? `${r.pendingInvestigationsCount} Pending` : 'Reconciled'}
                            </span>
                        </div>
                        <div className="nw-step-body">
                            <div className="nw-step-info">
                                <strong>Total Tests Ordered:</strong> {investigations.length}
                            </div>
                            <div className="nw-step-info">
                                <strong>Pending Reports:</strong> {r.pendingInvestigationsCount || 0}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
                                Ensure all critical lab reports have been reviewed by the attending physician prior to patient leaving ward.
                            </p>
                        </div>
                    </div>

                    {/* Stage 4: Billing & Pharmacy */}
                    <div className="nw-step-card neutral">
                        <div className="nw-step-header">
                            <span className="nw-step-num">4</span>
                            <h3>Billing & Pharmacy Reconciliation</h3>
                            <span className={`nw-status-pill ${(r.paymentStatus || 'pending').toLowerCase()}`}>
                                {r.paymentStatus || 'Pending'}
                            </span>
                        </div>
                        <div className="nw-step-body">
                            <div className="nw-step-info">
                                <strong>Estimated Inpatient Charges:</strong> ₹{r.totalAmount || admission?.totalAmount || '0'}
                            </div>
                            <div className="nw-step-info">
                                <strong>Payment Status:</strong> {r.paymentStatus || admission?.paymentStatus || 'Pending'}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '6px' }}>
                                Reception / Billing counter will calculate final stay charges upon administrative discharge.
                            </p>
                        </div>
                    </div>

                    {/* Stage 5: Final Administrative Discharge */}
                    <div className={`nw-step-card ${admission?.status === 'Discharged' ? 'complete' : 'neutral'}`}>
                        <div className="nw-step-header">
                            <span className="nw-step-num">5</span>
                            <h3>Final Administrative Checkout</h3>
                            <span className="nw-status-pill">
                                {admission?.status === 'Discharged' ? 'Discharged' : 'Pending Reception'}
                            </span>
                        </div>
                        <div className="nw-step-body">
                            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                                {admission?.status === 'Discharged' ? (
                                    'Patient has been discharged administratively. Bed has been released to available inventory.'
                                ) : (
                                    'Once Doctor Order and Nursing Clearance are completed, Reception will execute final discharge, settling billing and releasing bed.'
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Phase 7: Real-Time Discharge Blocker Engine Checklist ── */}
                <div style={{ marginTop: '24px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiShield color="#0284c7" /> Automated Discharge Blocker Engine Analysis
                            </h3>
                            <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                Real-time verification of hard safety blockers, clinical warnings, and take-home preparations
                            </p>
                        </div>
                        <button
                            type="button"
                            className="nw-mini-btn outline"
                            onClick={fetchDischargeBlockers}
                            disabled={loadingBlockers}
                        >
                            <FiRefreshCw className={loadingBlockers ? 'spin' : ''} />
                            <span>Re-Check Blockers</span>
                        </button>
                    </div>

                    {loadingBlockers ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                            Evaluating discharge safety criteria...
                        </div>
                    ) : blockersData?.blockers?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {blockersData.blockers.map((blk, bidx) => {
                                const isBlocking = blk.type === 'BLOCKING';
                                const isWarning = blk.type === 'WARNING';
                                const borderClr = isBlocking ? '#ef4444' : isWarning ? '#f59e0b' : '#3b82f6';
                                const bgClr = isBlocking ? '#fef2f2' : isWarning ? '#fffbeb' : '#eff6ff';

                                return (
                                    <div
                                        key={bidx}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '12px',
                                            padding: '10px 14px',
                                            background: bgClr,
                                            borderLeft: `4px solid ${borderClr}`,
                                            borderRadius: '8px',
                                            fontSize: '0.85rem'
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: isBlocking ? '#fee2e2' : isWarning ? '#fef3c7' : '#dbeafe',
                                            color: isBlocking ? '#991b1b' : isWarning ? '#92400e' : '#1e40af'
                                        }}>
                                            {blk.type}
                                        </span>
                                        <div>
                                            <strong style={{ color: '#0f172a' }}>{blk.title}: </strong>
                                            <span style={{ color: '#334155' }}>{blk.message}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FiCheckCircle size={18} /> All clinical discharge safety criteria are met! No blockers found.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // 14. TIMELINE TAB (Unified chronological log)
    const renderTimeline = () => (
        <div className="nw-section">
            <div className="nw-section-header">
                <h2 className="nw-section-title" style={{ margin: 0 }}>🕐 Central Inpatient Clinical Timeline</h2>
                <button className="nw-btn secondary small" onClick={fetchTimeline}>
                    <FiRefreshCw size={13} /> Refresh
                </button>
            </div>
            {loading.timeline ? (
                <div className="nw-loading"><div className="nw-spinner" /> Assembling clinical timeline...</div>
            ) : timelineItems.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.88rem' }}>No clinical events recorded yet.</div>
            ) : (
                <div className="nw-timeline">
                    {timelineItems.map((item, i) => (
                        <div className="nw-timeline-item" key={item.id || i}>
                            <div className={`nw-timeline-dot ${item.type.toLowerCase()}`} />
                            <div className="nw-timeline-content">
                                <div className="nw-timeline-time">
                                    {new Date(item.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    {item.by ? ` • ${item.by}` : ''}
                                    {item.badge && <span className="nw-timeline-badge">{item.badge}</span>}
                                </div>
                                <h4 className="nw-timeline-title">{item.title}</h4>
                                <p className="nw-timeline-text">{item.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Tab Router ──
    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview': return renderOverview();
            case 'orders': return renderOrders();
            case 'vitals': return renderVitals();
            case 'mar': return renderMAR();
            case 'notes': return renderNotes();
            case 'tasks': return renderTasks();
            case 'io': return renderIO();
            case 'lines': return renderLines();
            case 'wound': return renderWoundCare();
            case 'investigations': return renderInvestigations();
            case 'handover': return renderHandover();
            case 'ot': return renderOT();
            case 'discharge': return renderDischargeReadiness();
            case 'timeline': return renderTimeline();
            default: return null;
        }
    };

    if (loading.admission && !admission) {
        return (
            <div className="nurse-workspace">
                <div className="nw-topbar">
                    <button className="nw-back-btn" onClick={() => navigate('/nurse/dashboard')}>
                        <FiArrowLeft size={15} /> Back
                    </button>
                    <div className="nw-topbar-info"><h1>Loading Patient Workspace...</h1></div>
                </div>
                <div className="nw-loading" style={{ minHeight: '300px' }}><div className="nw-spinner" /> Loading admission data...</div>
            </div>
        );
    }

    if (!admission && !loading.admission) {
        return (
            <div className="nurse-workspace">
                <div className="nw-topbar">
                    <button className="nw-back-btn" onClick={() => navigate('/nurse/dashboard')}>
                        <FiArrowLeft size={15} /> Back
                    </button>
                    <div className="nw-topbar-info">
                        <h1>Admission Not Found</h1>
                        <p>This admission may have been discharged or does not exist.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="nurse-workspace">
            {/* ── Top Bar ── */}
            <div className="nw-topbar">
                <button className="nw-back-btn" onClick={() => navigate('/nurse/dashboard')}>
                    <FiArrowLeft size={15} /> Back
                </button>
                <div className="nw-topbar-info">
                    <h1>{patientName}</h1>
                    <p>{patientUid}{doctorName !== 'Not Assigned' ? ` • Dr. ${doctorName}` : ''}</p>
                </div>
                <div className="nw-topbar-badges">
                    <span className="nw-topbar-badge">🏥 {admission?.ward || 'Ward'}</span>
                    <span className="nw-topbar-badge">🛏️ Bed {admission?.bedNumber || '—'}</span>
                    
                    {/* Care Nurse assignment badge */}
                    <div className="nw-nurse-topbar-btn" onClick={() => setAssignModalOpen(true)}>
                        <FiUserCheck size={13} />
                        <span>{assignedNurseNames.length > 0 ? assignedNurseNames[0] : '+ Assign Nurse'}</span>
                    </div>

                    {isDischargeOrdered && (
                        <span className={`nw-topbar-badge ${isNursingCleared ? 'ready' : 'ordered'}`} onClick={() => setActiveTab('discharge')} style={{ cursor: 'pointer' }}>
                            {isNursingCleared ? '✓ Ready for Discharge' : '⚠️ Discharge Ordered'}
                        </span>
                    )}
                </div>
            </div>

            {/* ── Tabs Navigation ── */}
            <div className="nw-tabs">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        className={`nw-tab ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.icon} {tab.label}
                        {tab.key === 'orders' && orders.filter(o => o.status === 'ACTIVE').length > 0 && (
                            <span className="nw-tab-badge">{orders.filter(o => o.status === 'ACTIVE').length}</span>
                        )}
                        {tab.key === 'mar' && marRecords.filter(m => ['SCHEDULED', 'DUE'].includes(m.status)).length > 0 && (
                            <span className="nw-tab-badge">{marRecords.filter(m => ['SCHEDULED', 'DUE'].includes(m.status)).length}</span>
                        )}
                        {tab.key === 'tasks' && tasks.filter(t => t.status === 'PENDING').length > 0 && (
                            <span className="nw-tab-badge alert">{tasks.filter(t => t.status === 'PENDING').length}</span>
                        )}
                        {tab.key === 'lines' && (activeLines.length + activeCatheters.length > 0) && (
                            <span className="nw-tab-badge info">{activeLines.length + activeCatheters.length}</span>
                        )}
                        {tab.key === 'discharge' && isDischargeOrdered && !isNursingCleared && (
                            <span className="nw-tab-badge alert">!</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Tab Content ── */}
            <div className="nw-content" key={activeTab}>
                {renderTabContent()}
            </div>

            {/* ── MODALS ── */}

            {/* Care Nurse Assignment Modal */}
            {assignModalOpen && (
                <div className="nw-modal-overlay" onClick={() => setAssignModalOpen(false)}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>Assign Primary Care Nurse</h3>
                        </div>
                        <form onSubmit={handleAssignNurseSubmit}>
                            <div className="nw-modal-body">
                                <div className="nw-form-group">
                                    <label>Patient</label>
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{patientName} ({admission?.ward} • Bed {admission?.bedNumber})</div>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                    <label>Select Nurse *</label>
                                    <select
                                        value={assignForm.nurseId}
                                        onChange={e => setAssignForm(p => ({ ...p, nurseId: e.target.value }))}
                                        required
                                    >
                                        <option value="">-- Choose Nurse --</option>
                                        {hospitalNurses.map(n => (
                                            <option key={n._id} value={n._id}>
                                                {n.name} ({n.specialization || n.role || 'Staff Nurse'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                    <label>Assigned Shift</label>
                                    <select
                                        value={assignForm.shift}
                                        onChange={e => setAssignForm(p => ({ ...p, shift: e.target.value }))}
                                    >
                                        <option value="Morning">Morning Shift</option>
                                        <option value="Evening">Evening Shift</option>
                                        <option value="Night">Night Shift</option>
                                        <option value="All">All Shifts / Primary Incharge</option>
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                    <label>Assignment Notes</label>
                                    <textarea
                                        placeholder="Special instructions or handover notes for the assigned nurse..."
                                        value={assignForm.notes}
                                        onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))}
                                        rows={2}
                                    />
                                </div>
                            </div>
                            <div className="nw-modal-footer">
                                <button type="button" className="nw-btn secondary" onClick={() => setAssignModalOpen(false)}>Cancel</button>
                                <button type="submit" className="nw-btn primary" disabled={submitting || !assignForm.nurseId}>
                                    {submitting ? 'Assigning...' : 'Confirm Assignment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Nursing Clearance Modal */}
            {clearanceModalOpen && (
                <div className="nw-modal-overlay" onClick={() => setClearanceModalOpen(false)}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>Sign Off Nursing Clinical Clearance</h3>
                        </div>
                        <form onSubmit={handleSignOffClearance}>
                            <div className="nw-modal-body">
                                {(activeLines.length > 0 || activeCatheters.length > 0) && (
                                    <div className="nw-modal-alert warning">
                                        <FiAlertTriangle size={18} />
                                        <div>
                                            <strong>Safety Warning:</strong> Patient still has {activeLines.length} active lines and {activeCatheters.length} catheters. Please ensure invasive lines are removed before patient leaves the facility.
                                        </div>
                                    </div>
                                )}
                                <div className="nw-form-group">
                                    <label>Nursing Clearance Observations & Handover Instructions *</label>
                                    <textarea
                                        placeholder="Confirm patient vitals are stable, invasive devices removed/reconciled, and discharge medication counseling delivered..."
                                        value={clearanceNotes}
                                        onChange={e => setClearanceNotes(e.target.value)}
                                        rows={3}
                                        required
                                    />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                        <input
                                            type="checkbox"
                                            checked={clearanceConfirmed}
                                            onChange={e => setClearanceConfirmed(e.target.checked)}
                                        />
                                        I verify that nursing discharge checklist has been reviewed and patient is clinically cleared.
                                    </label>
                                </div>
                            </div>
                            <div className="nw-modal-footer">
                                <button type="button" className="nw-btn secondary" onClick={() => setClearanceModalOpen(false)}>Cancel</button>
                                <button type="submit" className="nw-btn primary" disabled={submitting || !clearanceConfirmed || !clearanceNotes.trim()}>
                                    {submitting ? 'Signing...' : '✓ Confirm Nursing Clearance'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MAR Reason Modal */}
            {marModal.open && (
                <div className="nw-modal-overlay" onClick={() => setMarModal({ open: false, record: null, action: '', reason: '' })}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>{marModal.action === 'HELD' ? '⏸ Hold Medication' : '✗ Refuse Medication'} — Reason Required</h3>
                        </div>
                        <div className="nw-modal-body">
                            <div className="nw-form-group">
                                <label>Medication</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', padding: '4px 0' }}>
                                    {typeof marModal.record?.orderId === 'object' ? marModal.record.orderId.medicineName : 'Medication'}
                                </div>
                            </div>
                            <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                <label>Reason *</label>
                                <textarea
                                    placeholder={`Why is this medication being ${marModal.action === 'HELD' ? 'held' : 'refused'}?`}
                                    value={marModal.reason}
                                    onChange={e => setMarModal(p => ({ ...p, reason: e.target.value }))}
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="nw-modal-footer">
                            <button className="nw-btn secondary" onClick={() => setMarModal({ open: false, record: null, action: '', reason: '' })}>Cancel</button>
                            <button className={`nw-btn ${marModal.action === 'HELD' ? 'secondary' : 'danger'}`} onClick={handleMARAction} disabled={submitting || !marModal.reason.trim()}>
                                {submitting ? 'Saving...' : `Confirm ${marModal.action === 'HELD' ? 'Hold' : 'Refuse'}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Action Modal (Complete / Skip) */}
            {taskModal.open && (
                <div className="nw-modal-overlay" onClick={() => setTaskModal({ open: false, task: null, action: '', notes: '' })}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>{taskModal.action === 'COMPLETED' ? '✓ Complete Task' : '⏭ Skip Task'}</h3>
                        </div>
                        <div className="nw-modal-body">
                            <div className="nw-form-group">
                                <label>Task</label>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>{taskModal.task?.title}</div>
                            </div>
                            <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                <label>Completion / Skip Notes</label>
                                <textarea
                                    placeholder="Enter clinical notes or observations upon completing/skipping this task..."
                                    value={taskModal.notes}
                                    onChange={e => setTaskModal(p => ({ ...p, notes: e.target.value }))}
                                    rows={3}
                                />
                            </div>
                        </div>
                        <div className="nw-modal-footer">
                            <button className="nw-btn secondary" onClick={() => setTaskModal({ open: false, task: null, action: '', notes: '' })}>Cancel</button>
                            <button className="nw-btn primary" onClick={handleUpdateTaskStatus} disabled={submitting}>
                                {submitting ? 'Saving...' : `Confirm ${taskModal.action}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Schedule New Task Modal */}
            {newTaskModalOpen && (
                <div className="nw-modal-overlay" onClick={() => setNewTaskModalOpen(false)}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>📋 Schedule Nursing Task</h3>
                        </div>
                        <form onSubmit={handleCreateTask}>
                            <div className="nw-modal-body">
                                <div className="nw-form-group">
                                    <label>Task Title *</label>
                                    <input type="text" placeholder="e.g. Check Blood Sugar, Change IV Bag" value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} required />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Task Type</label>
                                    <select value={taskForm.taskType} onChange={e => setTaskForm(p => ({ ...p, taskType: e.target.value }))}>
                                        <option value="VITALS">Vitals Check</option>
                                        <option value="MEDICATION">Medication Administration</option>
                                        <option value="SAMPLE_COLLECTION">Sample Collection</option>
                                        <option value="PROCEDURE_PREP">Procedure Preparation</option>
                                        <option value="POST_OP_MONITORING">Post-Op Monitoring</option>
                                        <option value="INTAKE_OUTPUT">Intake / Output Check</option>
                                        <option value="WOUND_CARE">Wound Care</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Priority</label>
                                    <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))}>
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Scheduled Date & Time</label>
                                    <input type="datetime-local" value={taskForm.scheduledAt} onChange={e => setTaskForm(p => ({ ...p, scheduledAt: e.target.value }))} />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Description / Instructions</label>
                                    <textarea placeholder="Specific directions for the nurse..." rows={2} value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} />
                                </div>
                            </div>
                            <div className="nw-modal-footer">
                                <button type="button" className="nw-btn secondary" onClick={() => setNewTaskModalOpen(false)}>Cancel</button>
                                <button type="submit" className="nw-btn primary" disabled={submitting}>
                                    {submitting ? 'Scheduling...' : 'Schedule Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Insert Line Modal */}
            {newLineModalOpen && (
                <div className="nw-modal-overlay" onClick={() => setNewLineModalOpen(false)}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>🔌 Record Line / Cannula Insertion</h3>
                        </div>
                        <form onSubmit={handleInsertLine}>
                            <div className="nw-modal-body">
                                <div className="nw-form-group">
                                    <label>Line Type *</label>
                                    <select value={lineForm.lineType} onChange={e => setLineForm(p => ({ ...p, lineType: e.target.value }))}>
                                        <option value="IV_CANNULA">Peripheral IV Cannula</option>
                                        <option value="CENTRAL_LINE">Central Venous Line</option>
                                        <option value="PICC">PICC Line</option>
                                        <option value="MIDLINE">Midline</option>
                                        <option value="ARTERIAL_LINE">Arterial Line</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Anatomical Site *</label>
                                    <input type="text" placeholder="e.g. Left Forearm, Right Hand Dorsum" value={lineForm.site} onChange={e => setLineForm(p => ({ ...p, site: e.target.value }))} required />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Gauge / Size</label>
                                    <input type="text" placeholder="e.g. 18G, 20G, 22G, 7Fr" value={lineForm.gauge} onChange={e => setLineForm(p => ({ ...p, gauge: e.target.value }))} />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Clinical Notes</label>
                                    <textarea placeholder="Insertion notes, patency verified..." rows={2} value={lineForm.notes} onChange={e => setLineForm(p => ({ ...p, notes: e.target.value }))} />
                                </div>
                            </div>
                            <div className="nw-modal-footer">
                                <button type="button" className="nw-btn secondary" onClick={() => setNewLineModalOpen(false)}>Cancel</button>
                                <button type="submit" className="nw-btn primary" disabled={submitting}>
                                    {submitting ? 'Inserting...' : 'Insert Line'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Insert Catheter Modal */}
            {newCathModalOpen && (
                <div className="nw-modal-overlay" onClick={() => setNewCathModalOpen(false)}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>Record Catheter Insertion</h3>
                        </div>
                        <form onSubmit={handleInsertCatheter}>
                            <div className="nw-modal-body">
                                <div className="nw-form-group">
                                    <label>Catheter Type *</label>
                                    <select value={catheterForm.catheterType} onChange={e => setCatheterForm(p => ({ ...p, catheterType: e.target.value }))}>
                                        <option value="FOLEY">Foley Catheter</option>
                                        <option value="URINARY">Urinary (Straight)</option>
                                        <option value="SUPRAPUBIC">Suprapubic Catheter</option>
                                        <option value="CONDOM">Condom Catheter</option>
                                        <option value="NEPHROSTOMY">Nephrostomy</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Size</label>
                                    <input type="text" placeholder="e.g. 14 Fr, 16 Fr, 18 Fr" value={catheterForm.size} onChange={e => setCatheterForm(p => ({ ...p, size: e.target.value }))} />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Site</label>
                                    <input type="text" placeholder="e.g. Urethral, Suprapubic" value={catheterForm.site} onChange={e => setCatheterForm(p => ({ ...p, site: e.target.value }))} />
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                    <label>Notes</label>
                                    <textarea placeholder="Balloon inflation volume (e.g. 10ml sterile water)..." rows={2} value={catheterForm.notes} onChange={e => setCatheterForm(p => ({ ...p, notes: e.target.value }))} />
                                </div>
                            </div>
                            <div className="nw-modal-footer">
                                <button type="button" className="nw-btn secondary" onClick={() => setNewCathModalOpen(false)}>Cancel</button>
                                <button type="submit" className="nw-btn primary" disabled={submitting}>
                                    {submitting ? 'Inserting...' : 'Insert Catheter'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Remove Device Modal */}
            {deviceRemoveModal.open && (
                <div className="nw-modal-overlay" onClick={() => setDeviceRemoveModal({ open: false, type: '', id: '', reason: '', notes: '' })}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>Remove {deviceRemoveModal.type === 'LINE' ? 'Line' : 'Catheter'}</h3>
                        </div>
                        <div className="nw-modal-body">
                            <div className="nw-form-group">
                                <label>Reason for Removal *</label>
                                <input type="text" placeholder="e.g. Discharged, Infiltration, Phlebitis, Expired" value={deviceRemoveModal.reason} onChange={e => setDeviceRemoveModal(p => ({ ...p, reason: e.target.value }))} />
                            </div>
                            <div className="nw-form-group" style={{ marginTop: '10px' }}>
                                <label>Site Condition on Removal</label>
                                <textarea placeholder="Site clean, no redness/swelling, catheter tip intact..." rows={2} value={deviceRemoveModal.notes} onChange={e => setDeviceRemoveModal(p => ({ ...p, notes: e.target.value }))} />
                            </div>
                        </div>
                        <div className="nw-modal-footer">
                            <button className="nw-btn secondary" onClick={() => setDeviceRemoveModal({ open: false, type: '', id: '', reason: '', notes: '' })}>Cancel</button>
                            <button className="nw-btn danger" onClick={handleRemoveDevice} disabled={submitting}>
                                {submitting ? 'Removing...' : 'Confirm Removal'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Request Order Clarification Modal (Phase 7) */}
            {clarificationModal.open && (
                <div className="nw-modal-overlay" onClick={() => setClarificationModal({ open: false, order: null, issueType: 'DOSAGE_CONFIRMATION', question: '' })}>
                    <div className="nw-modal" onClick={e => e.stopPropagation()}>
                        <div className="nw-modal-header">
                            <h3>❓ Ask Doctor Clarification on Order</h3>
                        </div>
                        <form onSubmit={handleSubmitClarification}>
                            <div className="nw-modal-body">
                                <div className="nw-form-group">
                                    <label>Order Item</label>
                                    <div style={{ fontWeight: 700, color: '#0f172a', padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px' }}>
                                        {clarificationModal.order?.medicineName} ({clarificationModal.order?.dosageValue} {clarificationModal.order?.dosageUnit}, {clarificationModal.order?.route}, {clarificationModal.order?.frequency})
                                    </div>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                    <label>Issue / Clarification Category *</label>
                                    <select
                                        value={clarificationModal.issueType}
                                        onChange={e => setClarificationModal(p => ({ ...p, issueType: e.target.value }))}
                                    >
                                        <option value="DOSAGE_CONFIRMATION">Dosage Confirmation</option>
                                        <option value="ROUTE_UNCERTAINTY">Route / Administration Uncertainty</option>
                                        <option value="FREQUENCY_CLARIFICATION">Frequency / Timing Clarification</option>
                                        <option value="DRUG_INTERACTION_CONCERN">Potential Drug Interaction Concern</option>
                                        <option value="PATIENT_ALLERGY_WARNING">Patient Allergy Warning</option>
                                        <option value="OTHER">Other Clinical Question</option>
                                    </select>
                                </div>
                                <div className="nw-form-group" style={{ marginTop: '12px' }}>
                                    <label>Clarification Question for Doctor *</label>
                                    <textarea
                                        placeholder="Type clear question for the attending physician (e.g. 'Patient has renal clearance issue; please verify dose frequency' or 'Confirm if 500mg IV TDS is intended')..."
                                        value={clarificationModal.question}
                                        onChange={e => setClarificationModal(p => ({ ...p, question: e.target.value }))}
                                        rows={3}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="nw-modal-footer">
                                <button type="button" className="nw-btn secondary" onClick={() => setClarificationModal({ open: false, order: null, issueType: 'DOSAGE_CONFIRMATION', question: '' })}>Cancel</button>
                                <button type="submit" className="nw-btn primary" disabled={submitting || !clarificationModal.question.trim()}>
                                    {submitting ? 'Sending Question...' : 'Send Clarification Request'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Toast Notification ── */}
            {toast && <div className={`nw-toast ${toast.type}`}>{toast.message}</div>}
        </div>
    );
};

export default NursePatientWorkspace;
