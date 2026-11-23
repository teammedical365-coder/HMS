import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { ipdClinicalAPI, admissionAPI, hospitalAPI } from '../../utils/api';
import {
    COMMON_NABH_LOGO_URL,
    resolveHospitalChartBranding,
    resolvePatientChartDetails
} from '../../utils/tprChartPdf';
import {
    PROGRESS_ROWS_PER_PAGE,
    buildProgressNotesHeaderData,
    paginateProgressNotes,
    downloadProgressNotesPdf,
    printProgressNotes
} from '../../utils/progressNotesPdf';
import {
    DRUG_CHART_TIME_SLOTS,
    DRUG_CHART_STAT_ROWS_PER_PAGE,
    DRUG_CHART_IV_ROWS_PER_PAGE,
    DRUG_CHART_MAR_BLOCKS_PER_PAGE,
    DRUG_CHART_PAGE2_SUBCOLS_MM,
    DRUG_CHART_PAGE2_SLOT_MM,
    STAT_COLS,
    IV_COLS,
    toLocalDateKey,
    formatDateDisplay,
    formatShortTime,
    getStaffInitials,
    mapScheduledTimeToDrugChartSlot,
    formatMarCellStatus,
    buildDrugChartDateWindows,
    buildCombinedStatRows,
    buildCombinedIVFluidRows,
    downloadDrugChartPdf,
    printDrugChart
} from '../../utils/drugChartPdf';
import socket from '../../utils/socket';
import {
    FiX,
    FiPrinter,
    FiDownload,
    FiFileText,
    FiPlus,
    FiSave,
    FiEdit2,
    FiClock,
    FiCheck,
    FiAlertTriangle,
    FiShield,
    FiChevronLeft,
    FiChevronRight,
    FiEye,
    FiDroplet,
    FiMic,
    FiEdit3,
    FiTrash2,
    FiRotateCcw,
    FiRotateCw,
    FiZap
} from 'react-icons/fi';
import TabletPenCanvas from './TabletPenCanvas';
import ClinicalVoiceScribeModal from './ClinicalVoiceScribeModal';
import toast from 'react-hot-toast';
import './IPDClinicalChartsModal.css';



function TabletSheetZoom({ children, zoom, setZoom }) {
    const touchRef = useRef({ distance: 0, startZoom: 1 });

    const zoomIn = () => setZoom(v => Math.min(2, +(v + 0.1).toFixed(2)));
    const zoomOut = () => setZoom(v => Math.max(0.6, +(v - 0.1).toFixed(2)));
    const fit = () => setZoom(1);

    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchRef.current = {
                distance: Math.hypot(dx, dy),
                startZoom: zoom
            };
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length !== 2 || !touchRef.current.distance) return;

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const distance = Math.hypot(dx, dy);
        const scale = distance / touchRef.current.distance;

        setZoom(Math.min(2, Math.max(0.6,
            +(touchRef.current.startZoom * scale).toFixed(2)
        )));
    };

    const handleTouchEnd = (e) => {
        if (e.touches.length < 2) touchRef.current.distance = 0;
    };

    return (
        <div
            className="tablet-sheet-zoom-area"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className="tablet-sheet-zoom-content"
                style={{
                    zoom,
                    width: "fit-content",
                    minWidth: "100%",
                    margin: "0 auto",
                    transformOrigin: "top center"
                }}
            >
                {children}
            </div>
        </div>
    );
}

const toDateTimeLocalValue = (dtVal) => {
    const d = dtVal ? new Date(dtVal) : new Date();
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const todayDateDisplay = () => {
    const d = new Date();
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const nowTime12h = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

const ROUTES_LIST = ['IV', 'Oral', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'Rectal', 'IV Push', 'IV Infusion', 'Other'];

const IPDClinicalChartsModal = ({
    isOpen,
    onClose,
    admissionId,
    admission: initialAdmission,
    patient: initialPatient,
    initialTab = 'progress_notes', // 'progress_notes' | 'drug_chart'
    isBlank = false
}) => {
    const { user } = useAuth();
    const { branding, hospitalName: brandingHospitalName } = useBranding();

    const userRole = (user?.role || '').toLowerCase();
    const isNurse = userRole === 'nurse';
    const canUsePenTool = !isNurse;

    const normalizeTab = (tab) => {
        if (tab === 'drug_stat_iv' || tab === 'drug_mar' || tab === 'drug_chart') return 'drug_chart';
        return 'progress_notes';
    };

    const [activeTab, setActiveTab] = useState(normalizeTab(initialTab));
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const [admission, setAdmission] = useState(initialAdmission || null);
    const [tenantHospital, setTenantHospital] = useState(null);

    // Progress Notes State
    const [progressNotes, setProgressNotes] = useState([]);
    const [manualExtraPages, setManualExtraPages] = useState(0);
    const [isScribeModalOpen, setIsScribeModalOpen] = useState(false);

    // Master Inline Editor Toolbar state
    const [activeTool, setActiveTool] = useState('type'); // 'type' | 'pen' | 'eraser'
    const [penColor, setPenColor] = useState('#1d4ed8');
    const [penWidth, setPenWidth] = useState(2);
    const [penStrokes, setPenStrokes] = useState({});
    const penStrokesRef = useRef({});
    useEffect(() => {
        penStrokesRef.current = penStrokes;
    }, [penStrokes]);
    const [undoStack, setUndoStack] = useState([]);
    const [redoStack, setRedoStack] = useState([]);
    const [activeLineKey, setActiveLineKey] = useState(null);
    const [activeFocusedKey, setActiveFocusedKey] = useState(null);
    const [dictatingKey, setDictatingKey] = useState(null);
    const lineDictationRef = useRef(null);
    const inputsRef = useRef({});
    const [dirtyNotes, setDirtyNotes] = useState(false);

    // Drug Chart Direct Inline Editing State
    const [editableStatRows, setEditableStatRows] = useState([]);
    const [editableIvRows, setEditableIvRows] = useState([]);
    const [dirtyDrugChart, setDirtyDrugChart] = useState(false);
    const [savingDrugChart, setSavingDrugChart] = useState(false);
    const [lastSavedProgressTime, setLastSavedProgressTime] = useState(null);
    const [lastSavedDrugChartTime, setLastSavedDrugChartTime] = useState(null);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const prev = undoStack[undoStack.length - 1];
        setRedoStack(r => [...r, progressNotes]);
        setUndoStack(u => u.slice(0, -1));
        setProgressNotes(prev);
    }, [undoStack, progressNotes]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        setUndoStack(u => [...u, progressNotes]);
        setRedoStack(r => r.slice(0, -1));
        setProgressNotes(next);
    }, [redoStack, progressNotes]);

    const [newProgressForm, setNewProgressForm] = useState({
        recordedAt: toDateTimeLocalValue(),
        sheetNo: '1',
        note: ''
    });
    const [savingProgress, setSavingProgress] = useState(false);
    const [editingProgress, setEditingProgress] = useState(null); // { _id, recordedAt, sheetNo, note, editReason }
    const [expandedProgressHistory, setExpandedProgressHistory] = useState({});

    // Drug Chart State
    const [drugChart, setDrugChart] = useState({
        drugAllergies: { slot1: '', slot2: '', sheetNo: '1', history: [] },
        statDoses: [],
        ivFluids: []
    });
    const [existingAllergies, setExistingAllergies] = useState({
        patientProfileAllergy: '',
        clinicalNoteAllergy: '',
        combinedSuggestions: []
    });
    const [orders, setOrders] = useState([]);
    const [marRecords, setMarRecords] = useState([]);

    const [allergyForm, setAllergyForm] = useState({ slot1: '', slot2: '', sheetNo: '1' });
    const [savingAllergy, setSavingAllergy] = useState(false);

    // STAT Dose Form
    const [showStatForm, setShowStatForm] = useState(false);
    const [statForm, setStatForm] = useState({
        date: todayDateDisplay(),
        time: nowTime12h(),
        drugName: '',
        dose: '',
        route: 'IV',
        doctorName: '',
        remarks: ''
    });
    const [savingStat, setSavingStat] = useState(false);
    const [statActionModal, setStatActionModal] = useState(null); // { entry, mode: 'administer' | 'check' | 'correct' | 'edit' }

    // IV Fluid Form
    const [showIvForm, setShowIvForm] = useState(false);
    const [ivForm, setIvForm] = useState({
        date: todayDateDisplay(),
        fluidName: '',
        volume: '500 ml',
        timeStart: nowTime12h(),
        infusionTimeHrs: '',
        doctorName: '',
        remarks: ''
    });
    const [savingIv, setSavingIv] = useState(false);
    const [ivActionModal, setIvActionModal] = useState(null); // { entry, mode: 'administer' | 'edit' }

    // Page 2 MAR Grid State
    const [dayWindowIdx, setDayWindowIdx] = useState(0);
    const [marCellModal, setMarCellModal] = useState(null); // { order, dateKey, slot, existingMar, isCorrection }
    const [savingMarCell, setSavingMarCell] = useState(false);
    const [expandedMarAudit, setExpandedMarAudit] = useState(false);

    // Drug Chart Inline CRUD State (Page 1 & Page 2)
    const [deletedStatIds, setDeletedStatIds] = useState([]);
    const [deletedIvIds, setDeletedIvIds] = useState([]);
    const [editableMedBlocks, setEditableMedBlocks] = useState([]);
    const [discontinuedOrderIds, setDiscontinuedOrderIds] = useState([]);
    const [manualExtraDrugPages, setManualExtraDrugPages] = useState(0);

    const rawAdmissionId = admissionId || initialAdmission?._id || initialAdmission?.id || admission?._id || null;
    const effectiveAdmissionId = (typeof rawAdmissionId === 'object' && rawAdmissionId)
        ? String(rawAdmissionId._id || rawAdmissionId.id || '')
        : (rawAdmissionId ? String(rawAdmissionId) : null);
    const isValidAdmission = Boolean(effectiveAdmissionId && effectiveAdmissionId !== 'undefined' && effectiveAdmissionId !== 'null' && effectiveAdmissionId.trim().length === 24);

    // Derive Role Flags accurately from user object
    const sanitizedRole = useMemo(() => {
        const raw = user?._roleData?.name || user?.role || '';
        return String(raw).toLowerCase().replace(/\s+/g, '');
    }, [user]);

    const userPerms = useMemo(() => user?._roleData?.permissions || [], [user]);
    const isDoctorUser = useMemo(() => (
        ['doctor', 'clinicdoctor', 'surgeon', 'consultant', 'physician', 'resident', 'residentdoctor'].includes(sanitizedRole) ||
        (userPerms.includes('doctor_access') && !['nurse', 'staffnurse', 'headnurse', 'assistant', 'doctorassistant'].includes(sanitizedRole))
    ), [sanitizedRole, userPerms]);

    const isDoctorOrAdmin = useMemo(() => (
        ['doctor', 'clinicdoctor', 'surgeon', 'consultant', 'physician', 'doctorassistant', 'assistant', 'clinicalassistant', 'resident', 'residentdoctor', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'].includes(sanitizedRole) ||
        userPerms.includes('*') ||
        userPerms.includes('doctor_access') ||
        userPerms.includes('clinical_manage')
    ), [sanitizedRole, userPerms]);

    const canNurseAdminister = useMemo(() => (
        ['nurse', 'staffnurse', 'headnurse', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'].includes(sanitizedRole) ||
        userPerms.includes('*') ||
        userPerms.includes('nurse_access') ||
        userPerms.includes('mar_administer')
    ), [sanitizedRole, userPerms]);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(normalizeTab(initialTab));
            setNewProgressForm({ recordedAt: toDateTimeLocalValue(), sheetNo: '1', note: '' });
            setStatForm(prev => ({
                ...prev,
                date: todayDateDisplay(),
                time: nowTime12h(),
                doctorName: user?.name ? (isDoctorUser ? `Dr. ${user.name.replace(/^dr\.?\s*/i, '')}` : '') : ''
            }));
            setIvForm(prev => ({
                ...prev,
                date: todayDateDisplay(),
                timeStart: nowTime12h(),
                doctorName: user?.name ? (isDoctorUser ? `Dr. ${user.name.replace(/^dr\.?\s*/i, '')}` : '') : ''
            }));
        }
    }, [isOpen, initialTab, isBlank, user?.name, isDoctorUser]);

    // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, undoStack, redoStack]);

    const loadAllData = useCallback(async () => {
        if (!isOpen) return;
        setLoading(true);
        try {
            const brandingPromise = user?.hospitalId
                ? hospitalAPI.getMyBranding().catch(() => null)
                : Promise.resolve(null);

            if (!isValidAdmission || isBlank) {
                const brandRes = await brandingPromise;
                if (brandRes?.hospital) setTenantHospital(brandRes.hospital);
                return;
            }

            const [brandRes, pnRes, dcRes, admRes] = await Promise.all([
                brandingPromise,
                ipdClinicalAPI.getProgressNotes(effectiveAdmissionId).catch(() => null),
                ipdClinicalAPI.getDrugChart(effectiveAdmissionId).catch(() => null),
                !initialAdmission ? admissionAPI.getAdmissionById(effectiveAdmissionId).catch(() => null) : Promise.resolve(null)
            ]);

            if (brandRes?.hospital) setTenantHospital(brandRes.hospital);

            const resolvedAdm = dcRes?.admission || pnRes?.admission || admRes?.admission || admRes?.data || initialAdmission || null;
            if (resolvedAdm) setAdmission(resolvedAdm);

            if (pnRes?.progressNotes) {
                setProgressNotes(pnRes.progressNotes);
            }

            const incomingStrokes = pnRes?.handwritingStrokes || dcRes?.handwritingStrokes || resolvedAdm?.handwritingStrokes || null;
            if (incomingStrokes && typeof incomingStrokes === 'object') {
                setPenStrokes(prev => {
                    const merged = { ...incomingStrokes, ...prev };
                    penStrokesRef.current = merged;
                    return merged;
                });
            }

            if (dcRes?.drugChart) {
                setDrugChart(dcRes.drugChart);
                const da = dcRes.drugChart.drugAllergies || {};
                setAllergyForm({
                    slot1: da.slot1 || '',
                    slot2: da.slot2 || '',
                    sheetNo: da.sheetNo || '1'
                });
            }
            if (dcRes?.existingAllergies) {
                setExistingAllergies(dcRes.existingAllergies);
            }
            if (Array.isArray(dcRes?.orders)) {
                setOrders(dcRes.orders);
            }
            if (Array.isArray(dcRes?.marRecords)) {
                setMarRecords(dcRes.marRecords);
            }
        } catch (err) {
            console.error('Failed to load clinical chart data:', err);
            toast.error('Failed to load clinical chart records');
        } finally {
            setLoading(false);
        }
    }, [isOpen, effectiveAdmissionId, isBlank, user?.hospitalId, initialAdmission]);

    useEffect(() => {
        if (isOpen) loadAllData();
    }, [isOpen, loadAllData]);

    // Socket real-time sync for multi-user hospital floor updates
    useEffect(() => {
        if (!isOpen || !user?.hospitalId || isBlank) return;
        const events = ['ipd_progress_note_updated', 'ipd_drug_chart_updated', 'mar_administered', 'inpatient_order_created', 'inpatient_order_updated'];
        const handler = (payload) => {
            if (!payload?.admissionId || String(payload.admissionId) === String(effectiveAdmissionId)) {
                loadAllData();
            }
        };
        events.forEach(ev => socket.on(ev, handler));
        return () => events.forEach(ev => socket.off(ev, handler));
    }, [isOpen, user?.hospitalId, isBlank, effectiveAdmissionId, loadAllData]);

    const hospitalObj = useMemo(
        () => resolveHospitalChartBranding({ tenantHospital, branding, brandingHospitalName, user }),
        [tenantHospital, branding, brandingHospitalName, user]
    );

    const ptDetails = useMemo(
        () => resolvePatientChartDetails({ patient: initialPatient || admission?.patientId, admission, isBlank }),
        [initialPatient, admission, isBlank]
    );

    const headerData = useMemo(
        () => buildProgressNotesHeaderData({ patient: initialPatient || admission?.patientId, admission, isBlank }),
        [initialPatient, admission, isBlank]
    );

    const combinedStatRows = useMemo(() => buildCombinedStatRows(drugChart, orders, admission), [drugChart, orders, admission]);
    const combinedIvRows = useMemo(() => buildCombinedIVFluidRows(drugChart, orders, admission), [drugChart, orders, admission]);

    const admissionDoctorName = useMemo(() => {
        const docObj = (admission && typeof admission.doctorId === 'object' ? admission.doctorId : null) || {};
        const apptObj = (admission && typeof admission.appointmentId === 'object' ? admission.appointmentId : null) || {};
        const admittedByObj = (admission && typeof admission.admittedBy === 'object' ? admission.admittedBy : null) || {};
        const raw = docObj.name || 
            apptObj.doctorName || 
            (typeof admission?.doctorName === 'string' ? admission.doctorName : '') ||
            admittedByObj.name ||
            headerData.consultant ||
            '';
        if (!raw) return '';
        return /^dr\.?\s*/i.test(raw) ? raw : `Dr. ${raw}`;
    }, [admission, headerData.consultant]);

    const defaultPrescribingDoctor = useMemo(() => {
        if (isDoctorUser) {
            return user?.name ? (/^dr\.?\s*/i.test(user.name) ? user.name : `Dr. ${user.name}`) : '';
        }
        // If nurse or assistant or staff: NEVER auto-fill nurse's name into doctor column!
        return admissionDoctorName || '';
    }, [isDoctorUser, user?.name, admissionDoctorName]);

    const sanitizeDisplayDoctor = useCallback((docName, givenByName) => {
        const d = String(docName || '').trim();
        const g = String(givenByName || '').trim();
        const isNurse = ['nurse', 'staffnurse', 'headnurse'].includes(sanitizedRole);
        if (!d) return admissionDoctorName || '';
        if (g && d.toLowerCase() === g.toLowerCase()) return admissionDoctorName || '';
        if (isNurse && user?.name && d.toLowerCase() === user.name.toLowerCase()) return admissionDoctorName || '';
        if (/\(nurse\)/i.test(d)) return admissionDoctorName || '';
        return /^dr\.?\s*/i.test(d) ? d : `Dr. ${d}`;
    }, [sanitizedRole, user?.name, admissionDoctorName]);

    // Scheduled MAR orders (exclude STAT orders unless they already have MAR entries)
    const marOrders = useMemo(() => (orders || []).filter(o => {
        const isStat = String(o.frequency || '').toUpperCase().trim() === 'STAT';
        if (!isStat) return true;
        return (marRecords || []).some(m => String(m.orderId?._id || m.orderId) === String(o._id));
    }), [orders, marRecords]);

    const dateWindows = useMemo(
        () => buildDrugChartDateWindows({ admission, orders: marOrders, marRecords }),
        [admission, marOrders, marRecords]
    );

    useEffect(() => {
        if (dayWindowIdx >= dateWindows.length) {
            setDayWindowIdx(Math.max(0, dateWindows.length - 1));
        }
    }, [dateWindows.length, dayWindowIdx]);

    const activeFourDates = useMemo(
        () => dateWindows[dayWindowIdx] || dateWindows[0] || [],
        [dateWindows, dayWindowIdx]
    );

    const marCellLookup = useMemo(() => {
        const map = new Map();
        (marRecords || []).forEach((m) => {
            const ordId = String(m.orderId?._id || m.orderId || '');
            const dKey = m.scheduledDateKey || toLocalDateKey(m.scheduledTime);
            const slot = mapScheduledTimeToDrugChartSlot(m);
            if (!ordId || !dKey || !slot) return;
            const k = `${ordId}::${dKey}::${slot}`;
            const prev = map.get(k);
            const completed = ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'];
            if (!prev || completed.includes(String(m.status).toUpperCase())) {
                map.set(k, m);
            }
        });
        return map;
    }, [marRecords]);

    // ==================== DRUG CHART ROW SYNC & INLINE EDITING ====================
    useEffect(() => {
        if (!dirtyDrugChart) {
            const rows = [...combinedStatRows].map(s => ({
                ...s,
                doctorName: sanitizeDisplayDoctor(s.doctorName, s.givenByName)
            }));
            while (rows.length < DRUG_CHART_STAT_ROWS_PER_PAGE) {
                rows.push({
                    _id: null,
                    date: '',
                    time: '',
                    drugName: '',
                    dose: '',
                    route: '',
                    doctorName: '',
                    givenByName: '',
                    checkedByName: '',
                    remarks: '',
                    status: 'PENDING',
                    isNew: true
                });
            }
            setEditableStatRows(rows);
        }
    }, [combinedStatRows, dirtyDrugChart, defaultPrescribingDoctor, sanitizeDisplayDoctor, isDoctorUser, user?.name]);

    useEffect(() => {
        if (!dirtyDrugChart) {
            const rows = [...combinedIvRows].map(iv => ({
                ...iv,
                doctorName: sanitizeDisplayDoctor(iv.doctorName, iv.adminByName)
            }));
            while (rows.length < DRUG_CHART_IV_ROWS_PER_PAGE) {
                rows.push({
                    _id: null,
                    date: '',
                    fluidName: '',
                    volume: '',
                    timeStart: '',
                    infusionTimeHrs: '',
                    doctorName: '',
                    adminByName: '',
                    remarks: '',
                    status: 'PENDING',
                    isNew: true
                });
            }
            setEditableIvRows(rows);
        }
    }, [combinedIvRows, dirtyDrugChart, defaultPrescribingDoctor, sanitizeDisplayDoctor, isDoctorUser, user?.name]);

    useEffect(() => {
        if (!dirtyDrugChart) {
            const blocks = [];
            (marOrders || []).forEach(ord => {
                const doseStr = `${ord.dosageValue ?? ord.dosage?.value ?? ''} ${ord.dosageUnit || ord.dosage?.unit || ''}`.trim();
                const drRaw = ord.doctorId?.name || ord.prescribedByName || '';
                const drStr = drRaw ? (/^dr/i.test(drRaw) ? drRaw : `Dr. ${drRaw}`) : '';
                const startStr = ord.startDate ? formatDateDisplay(ord.startDate) : '';

                blocks.push({
                    _id: String(ord._id),
                    orderId: ord._id,
                    medicineName: ord.medicineName || '',
                    startDate: startStr,
                    route: ord.route || 'Oral',
                    dose: doseStr,
                    doctorName: drStr,
                    status: ord.status || 'ACTIVE',
                    instructions: ord.instructions || '',
                    isNew: false
                });
            });

            const minBlockCount = Math.max(DRUG_CHART_MAR_BLOCKS_PER_PAGE, (1 + manualExtraDrugPages) * DRUG_CHART_MAR_BLOCKS_PER_PAGE);
            while (blocks.length < minBlockCount) {
                blocks.push({
                    _id: null,
                    orderId: null,
                    medicineName: '',
                    startDate: '',
                    route: '',
                    dose: '',
                    doctorName: '',
                    status: '',
                    instructions: '',
                    isNew: true
                });
            }
            setEditableMedBlocks(blocks);
        }
    }, [marOrders, dirtyDrugChart, isDoctorOrAdmin, user?.name, manualExtraDrugPages]);

    // ==================== LINE-LEVEL MICROPHONE DICTATION ====================
    const handleToggleLineDictation = (targetKey, currentValue, onChangeCallback, isNumeric = false) => {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            toast.error('Web Speech API is not supported in this browser. Please use Chrome/Edge or AI Voice Scribe.');
            return;
        }

        if (dictatingKey === targetKey) {
            if (lineDictationRef.current) {
                lineDictationRef.current.stop();
                lineDictationRef.current = null;
            }
            setDictatingKey(null);
            return;
        }

        if (lineDictationRef.current) {
            lineDictationRef.current.stop();
            lineDictationRef.current = null;
        }

        try {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-IN';

            recognition.onstart = () => {
                setDictatingKey(targetKey);
                toast('Listening for speech...', { icon: '🎙️', duration: 1500 });
            };

            recognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        transcript += event.results[i][0].transcript;
                    }
                }
                if (transcript.trim()) {
                    let spoken = transcript.trim();
                    if (isNumeric) {
                        const numMatch = spoken.match(/\d+(\.\d+)?/);
                        if (numMatch) spoken = numMatch[0];
                    }
                    const updatedVal = currentValue ? `${currentValue} ${spoken}`.trim() : spoken;
                    onChangeCallback(updatedVal);
                }
            };

            recognition.onerror = (e) => {
                console.warn('Line dictation error:', e?.error);
                setDictatingKey(null);
                lineDictationRef.current = null;
            };

            recognition.onend = () => {
                setDictatingKey(null);
                lineDictationRef.current = null;
            };

            lineDictationRef.current = recognition;
            recognition.start();
        } catch (err) {
            console.error('Line dictation failed to start:', err);
            setDictatingKey(null);
        }
    };

    // ==================== DRUG CHART INLINE CELL HANDLERS ====================
    const handleStatCellChange = (rIdx, colKey, val) => {
        setDirtyDrugChart(true);
        setEditableStatRows(prev => {
            const copy = [...prev];
            copy[rIdx] = { ...copy[rIdx], [colKey]: val };
            return copy;
        });
    };

    const handleIvCellChange = (rIdx, colKey, val) => {
        setDirtyDrugChart(true);
        setEditableIvRows(prev => {
            const copy = [...prev];
            copy[rIdx] = { ...copy[rIdx], [colKey]: val };
            return copy;
        });
    };

    const handleDeleteStatRow = (rIdx) => {
        const target = editableStatRows[rIdx];
        if (target?._id && !String(target._id).startsWith('order-') && !target.isNew) {
            setDeletedStatIds(prev => [...prev, String(target._id)]);
        }
        setDirtyDrugChart(true);
        setEditableStatRows(prev => {
            const copy = prev.filter((_, idx) => idx !== rIdx);
            while (copy.length < DRUG_CHART_STAT_ROWS_PER_PAGE) {
                copy.push({
                    _id: null,
                    date: '',
                    time: '',
                    drugName: '',
                    dose: '',
                    route: '',
                    doctorName: '',
                    givenByName: '',
                    checkedByName: '',
                    remarks: '',
                    status: 'PENDING',
                    isNew: true
                });
            }
            return copy;
        });
    };

    const handleDeleteIvRow = (rIdx) => {
        const target = editableIvRows[rIdx];
        if (target?._id && !String(target._id).startsWith('ivorder-') && !target.isNew) {
            setDeletedIvIds(prev => [...prev, String(target._id)]);
        }
        setDirtyDrugChart(true);
        setEditableIvRows(prev => {
            const copy = prev.filter((_, idx) => idx !== rIdx);
            while (copy.length < DRUG_CHART_IV_ROWS_PER_PAGE) {
                copy.push({
                    _id: null,
                    date: '',
                    fluidName: '',
                    volume: '',
                    timeStart: '',
                    infusionTimeHrs: '',
                    doctorName: '',
                    adminByName: '',
                    remarks: '',
                    status: 'PENDING',
                    isNew: true
                });
            }
            return copy;
        });
    };

    const handleMedBlockChange = (bIdx, field, val) => {
        setDirtyDrugChart(true);
        setEditableMedBlocks(prev => {
            const copy = [...prev];
            copy[bIdx] = { ...copy[bIdx], [field]: val };
            return copy;
        });
    };

    const handleDiscontinueOrder = (bIdx) => {
        const block = editableMedBlocks[bIdx];
        if (block?.orderId) {
            setDiscontinuedOrderIds(prev => [...prev, String(block.orderId)]);
            setDirtyDrugChart(true);
            setEditableMedBlocks(prev => {
                const copy = [...prev];
                copy[bIdx] = { ...copy[bIdx], status: 'CANCELLED' };
                return copy;
            });
            toast.info(`Marked ${block.medicineName || 'Medication'} as Discontinued`);
        } else {
            // Draft block: reset back to empty
            setEditableMedBlocks(prev => {
                const copy = [...prev];
                copy[bIdx] = {
                    _id: null,
                    orderId: null,
                    medicineName: '',
                    startDate: '',
                    route: '',
                    dose: '',
                    doctorName: '',
                    status: 'ACTIVE',
                    instructions: '',
                    isNew: true
                };
                return copy;
            });
        }
    };

    const handleCellNav = (e, section, rIdx, colKey) => {
        const statCols = ['date', 'drugName', 'dose', 'route', 'time', 'doctorName', 'givenByName', 'checkedByName', 'remarks'];
        const ivCols = ['date', 'fluidName', 'volume', 'timeStart', 'infusionTimeHrs', 'doctorName', 'adminByName', 'remarks'];
        const cols = section === 'stat' ? statCols : ivCols;
        const colIdx = cols.indexOf(colKey);

        if (e.key === 'Tab') {
            if (!e.shiftKey && colIdx === cols.length - 1) {
                e.preventDefault();
                const nextKey = `${section}_${rIdx + 1}_${cols[0]}`;
                inputsRef.current[nextKey]?.focus();
            } else if (e.shiftKey && colIdx === 0 && rIdx > 0) {
                e.preventDefault();
                const prevKey = `${section}_${rIdx - 1}_${cols[cols.length - 1]}`;
                inputsRef.current[prevKey]?.focus();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const nextRowKey = `${section}_${rIdx + 1}_${colKey}`;
            inputsRef.current[nextRowKey]?.focus();
        } else if (e.key === 'Escape') {
            e.target.blur();
        }
    };

    const handleSaveDrugChartInline = async () => {
        if (!effectiveAdmissionId) return;
        setSavingDrugChart(true);
        try {
            const newOrdersToCreate = editableMedBlocks
                .filter(b => b.isNew && b.medicineName && b.medicineName.trim())
                .map(b => ({
                    medicineName: b.medicineName.trim(),
                    dose: b.dose,
                    route: b.route,
                    startDate: b.startDate,
                    doctorName: b.doctorName
                }));

            const payload = {
                drugAllergies: allergyForm,
                statDoses: editableStatRows.filter(s => s && s.drugName && s.drugName.trim()),
                ivFluids: editableIvRows.filter(iv => iv && iv.fluidName && iv.fluidName.trim()),
                deletedStatIds,
                deletedIvIds,
                newRegularOrders: newOrdersToCreate,
                discontinuedOrderIds
            };
            const res = await ipdClinicalAPI.updateDrugChart(effectiveAdmissionId, payload);
            if (res?.drugChart || res?.success) {
                // Also persist latest vector handwriting strokes
                const currentStrokes = penStrokesRef.current || penStrokes;
                if (currentStrokes && Object.keys(currentStrokes).length > 0) {
                    await ipdClinicalAPI.saveHandwriting(effectiveAdmissionId, { strokes: currentStrokes }).catch(err => {
                        console.warn('Handwriting save warning in drug chart:', err);
                    });
                }
                if (res.drugChart) setDrugChart(res.drugChart);
                setDirtyDrugChart(false);
                setDeletedStatIds([]);
                setDeletedIvIds([]);
                setDiscontinuedOrderIds([]);
                setLastSavedDrugChartTime(new Date());
                toast.success('Drug Chart saved successfully.');
                await loadAllData();
            } else {
                throw new Error(res?.message || 'Save failed — please retry');
            }
        } catch (err) {
            console.error('Save drug chart error:', err);
            toast.error(err.response?.data?.message || err.message || 'Save failed — please retry');
        } finally {
            setSavingDrugChart(false);
        }
    };

    // ==================== AI VOICE SCRIBE & INLINE EDITING HANDLERS ====================
    const handleSaveStrokes = (pageKey, newStrokes) => {
        setPenStrokes(prev => {
            const next = {
                ...prev,
                [pageKey]: newStrokes
            };
            penStrokesRef.current = next;
            return next;
        });
        if (activeTab === 'progress_notes') {
            setDirtyNotes(true);
        } else {
            setDirtyDrugChart(true);
        }
    };

    const handleClearProgressRow = (pageIdx, rowIdx, r) => {
        setDirtyNotes(true);
        setUndoStack(u => [...u.slice(-20), progressNotes]);
        if (r && r.noteId && !r.isSigRow) {
            setProgressNotes(prev => prev.map(n => {
                if (String(n._id) === String(r.noteId)) {
                    const lines = String(n.note || '').split('\n');
                    const targetLine = r.lineIdx !== undefined ? r.lineIdx : 0;
                    if (targetLine < lines.length) {
                        lines[targetLine] = '';
                        return { ...n, note: lines.join('\n') };
                    }
                }
                return n;
            }));
        } else {
            const sheetNum = String(pageIdx + 1);
            setProgressNotes(prev => {
                const existingDraftIdx = prev.findIndex(n => n.isNew && String(n.sheetNo) === sheetNum && n.rowIndex === rowIdx);
                if (existingDraftIdx >= 0) {
                    const copy = [...prev];
                    copy[existingDraftIdx] = { ...copy[existingDraftIdx], note: '' };
                    return copy;
                }
                return prev;
            });
        }
    };

    const getAuthorInfo = useCallback(() => {
        const rawRole = user?._roleData?.name || user?.role || '';
        const cleanR = String(rawRole).toLowerCase().replace(/\s+/g, '');
        let roleLabel = 'Clinician';
        let isDoc = false;

        if (['doctor', 'clinicdoctor', 'surgeon', 'consultant', 'physician', 'resident', 'residentdoctor'].includes(cleanR)) {
            roleLabel = 'Doctor';
            isDoc = true;
        } else if (['doctorassistant', 'assistant', 'clinicalassistant'].includes(cleanR)) {
            roleLabel = 'Doctor Assistant';
        } else if (['nurse', 'staffnurse', 'headnurse'].includes(cleanR)) {
            roleLabel = 'Staff Nurse';
        } else if (rawRole) {
            roleLabel = rawRole;
        }

        let name = user?.name || 'Clinical Staff';
        if (isDoc) {
            name = /^dr\.?\s*/i.test(name) ? name : `Dr. ${name}`;
        } else if (/nurse/i.test(roleLabel)) {
            name = name.replace(/^dr\.?\s*/i, '');
        }

        return { authorName: name, authorRole: roleLabel };
    }, [user]);

    const handleProgressRowTextChange = (pageIdx, rowIdx, newText, r) => {
        setDirtyNotes(true);
        setUndoStack(u => [...u.slice(-20), progressNotes]);

        if (r && r.noteId && !r.isSigRow) {
            // Editing a specific line of an existing note
            setProgressNotes(prev => prev.map(n => {
                if (String(n._id) === String(r.noteId)) {
                    const lines = String(n.note || '').split('\n');
                    const targetLine = r.lineIdx !== undefined ? r.lineIdx : 0;
                    while (lines.length <= targetLine) lines.push('');
                    lines[targetLine] = newText;
                    return { ...n, note: lines.join('\n') };
                }
                return n;
            }));
        } else {
            // Writing into a blank line (starts or continues note at this exact row position)
            const sheetNum = String(pageIdx + 1);
            const authorInfo = getAuthorInfo();
            setProgressNotes(prev => {
                // If a draft exists on this exact sheet and row, update it directly
                const existingDraftIdx = prev.findIndex(n => n.isNew && String(n.sheetNo) === sheetNum && n.rowIndex === rowIdx);
                if (existingDraftIdx >= 0) {
                    const copy = [...prev];
                    copy[existingDraftIdx] = { ...copy[existingDraftIdx], note: newText };
                    return copy;
                }
                // Otherwise create new draft pinned to this exact row
                const newEntry = {
                    _id: `draft_${Date.now()}_${pageIdx}_${rowIdx}`,
                    recordedAt: new Date().toISOString(),
                    sheetNo: sheetNum,
                    rowIndex: rowIdx,
                    note: newText,
                    authorName: authorInfo.authorName,
                    authorRole: authorInfo.authorRole,
                    isNew: true
                };
                return [...prev, newEntry];
            });
        }
    };

    const handleProgressRowKeyDown = (e, pageIdx, rowIdx, r) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const targetRowIdx = e.shiftKey ? rowIdx - 1 : rowIdx + 1;
            const targetKey = `${pageIdx}_${targetRowIdx}`;
            if (inputsRef.current[targetKey]) {
                inputsRef.current[targetKey].focus();
            } else if (e.shiftKey && pageIdx > 0) {
                const prevPageKey = `${pageIdx - 1}_${PROGRESS_ROWS_PER_PAGE - 1}`;
                inputsRef.current[prevPageKey]?.focus();
            } else if (!e.shiftKey && pageIdx + 1 < progressPages.length) {
                const nextPageKey = `${pageIdx + 1}_0`;
                inputsRef.current[nextPageKey]?.focus();
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            setDirtyNotes(true);
            if (r && r.noteId && !r.isSigRow) {
                // Split or add a new line inside this note
                setProgressNotes(prev => {
                    setUndoStack(u => [...u.slice(-20), prev]);
                    return prev.map(n => {
                        if (String(n._id) === String(r.noteId)) {
                            const lines = String(n.note || '').split('\n');
                            const curIdx = r.lineIdx !== undefined ? r.lineIdx : lines.length - 1;
                            lines.splice(curIdx + 1, 0, '');
                            return { ...n, note: lines.join('\n') };
                        }
                        return n;
                    });
                });
            } else {
                // Typing in active draft: append newline
                setProgressNotes(prev => {
                    const activeDraft = prev.find(n => n.isNew);
                    if (activeDraft) {
                        return prev.map(n => n._id === activeDraft._id ? { ...n, note: `${n.note}\n` } : n);
                    }
                    return prev;
                });
            }
            setTimeout(() => {
                const nextKey = `${pageIdx}_${rowIdx + 1}`;
                inputsRef.current[nextKey]?.focus();
            }, 50);
        } else if (e.key === 'Backspace' && (!e.target.value || e.target.value.length === 0)) {
            if (r && r.noteId && !r.isSigRow && (r.lineIdx || 0) > 0) {
                e.preventDefault();
                setProgressNotes(prev => prev.map(n => {
                    if (String(n._id) === String(r.noteId)) {
                        const lines = String(n.note || '').split('\n');
                        if (lines.length > 1 && lines[r.lineIdx] === '') {
                            lines.splice(r.lineIdx, 1);
                            return { ...n, note: lines.join('\n') };
                        }
                    }
                    return n;
                }));
                setTimeout(() => {
                    const prevKey = `${pageIdx}_${rowIdx - 1}`;
                    inputsRef.current[prevKey]?.focus();
                }, 50);
            } else if (rowIdx > 0) {
                const prevKey = `${pageIdx}_${rowIdx - 1}`;
                inputsRef.current[prevKey]?.focus();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextKey = `${pageIdx}_${rowIdx + 1}`;
            inputsRef.current[nextKey]?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevKey = `${pageIdx}_${rowIdx - 1}`;
            inputsRef.current[prevKey]?.focus();
        }
    };

    const handleProgressRowFocus = (pageIdx, rowIdx) => {
        setActiveLineKey(`${pageIdx}_${rowIdx}`);
        setActiveFocusedKey(`pn_${pageIdx}_${rowIdx}`);
    };

    const handleSaveAllInline = async () => {
        if (!effectiveAdmissionId) return;
        setSavingProgress(true);
        try {
            // 1. Create all newly written notes
            const newEntries = progressNotes.filter(n => n.isNew && n.note && n.note.trim());
            for (const n of newEntries) {
                const res = await ipdClinicalAPI.addProgressNote(effectiveAdmissionId, {
                    recordedAt: n.recordedAt || new Date().toISOString(),
                    sheetNo: n.sheetNo || '1',
                    rowIndex: typeof n.rowIndex === 'number' ? n.rowIndex : null,
                    note: n.note.trim()
                });
                if (!res || !res.success) {
                    throw new Error(res?.message || 'Failed to save new progress note');
                }
            }

            // 2. Update modified existing notes
            const modifiedEntries = progressNotes.filter(n => !n.isNew && n._id && n.note);
            for (const n of modifiedEntries) {
                const res = await ipdClinicalAPI.updateProgressNote(effectiveAdmissionId, n._id, {
                    note: n.note.trim(),
                    recordedAt: n.recordedAt,
                    sheetNo: n.sheetNo || '1',
                    rowIndex: typeof n.rowIndex === 'number' ? n.rowIndex : null,
                    editReason: 'Inline clinical documentation update'
                });
                if (!res || !res.success) {
                    throw new Error(res?.message || `Failed to update progress note ${n._id}`);
                }
            }

            // 3. Persist latest vector handwriting strokes
            const currentStrokes = penStrokesRef.current || penStrokes;
            if (currentStrokes && Object.keys(currentStrokes).length > 0) {
                const strokeRes = await ipdClinicalAPI.saveHandwriting(effectiveAdmissionId, { strokes: currentStrokes }).catch(err => {
                    console.warn('Handwriting save warning in progress notes:', err);
                    return null;
                });
                if (strokeRes?.handwritingStrokes) {
                    setPenStrokes(strokeRes.handwritingStrokes);
                    penStrokesRef.current = strokeRes.handwritingStrokes;
                }
            }

            setDirtyNotes(false);
            setLastSavedProgressTime(new Date());
            toast.success('Clinical Progress Notes saved successfully.');
            await loadAllData();
        } catch (err) {
            console.error('Save progress notes error:', err);
            toast.error(err.response?.data?.message || err.message || 'Save failed — please retry');
        } finally {
            setSavingProgress(false);
        }
    };

    const handleApproveVoiceScribe = ({ sections, session }) => {
        const parts = [];
        if (sections) {
            Object.entries(sections).forEach(([key, val]) => {
                if (!val) return;
                if (typeof val === 'string' && val.trim()) {
                    parts.push(val.trim());
                } else if (typeof val === 'object' && Object.keys(val).length > 0) {
                    const subParts = Object.entries(val).filter(([, v]) => Boolean(v)).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(', ');
                    if (subParts) parts.push(subParts);
                }
            });
        }
        const textToInsert = parts.length > 0 ? parts.join('\n') : (session?.rawTranscript || '');

        if (textToInsert) {
            if (activeTab === 'progress_notes') {
                const newEntry = {
                    _id: `draft_${Date.now()}`,
                    recordedAt: new Date().toISOString(),
                    sheetNo: String(progressPages.length || 1),
                    note: textToInsert,
                    authorName: user?.name ? (isDoctorUser ? `Dr. ${user.name.replace(/^dr\.?\s*/i, '')}` : user.name.replace(/^dr\.?\s*/i, '')) : 'Clinical Staff',
                    authorRole: user?._roleData?.name || user?.role || 'Clinician',
                    isNew: true
                };
                setProgressNotes(prev => [...prev, newEntry]);
                setDirtyNotes(true);
                toast.success('Gemini AI consultation structured into Progress Notes!');
            } else if (activeTab === 'drug_chart') {
                setDirtyDrugChart(true);
                setEditableStatRows(prev => {
                    const copy = [...prev];
                    const firstEmpty = copy.findIndex(r => !r.remarks || !r.remarks.trim());
                    const targetIdx = firstEmpty >= 0 ? firstEmpty : 0;
                    if (copy[targetIdx]) {
                        copy[targetIdx] = {
                            ...copy[targetIdx],
                            remarks: copy[targetIdx].remarks ? `${copy[targetIdx].remarks}; ${textToInsert}` : textToInsert
                        };
                    }
                    return copy;
                });
                toast.success('Gemini AI consultation inserted into Drug Chart!');
            } else {
                toast.success('Gemini AI transcription captured');
            }
        }
    };

    // ==================== PROGRESS NOTES HANDLERS ====================
    const handleAddProgressNote = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId) return toast.error('Active IPD admission required');
        if (!newProgressForm.note.trim()) return toast.error('Please enter clinical progress observation');

        setSavingProgress(true);
        try {
            const res = await ipdClinicalAPI.addProgressNote(effectiveAdmissionId, {
                recordedAt: newProgressForm.recordedAt ? new Date(newProgressForm.recordedAt).toISOString() : new Date().toISOString(),
                sheetNo: newProgressForm.sheetNo || '1',
                note: newProgressForm.note.trim()
            });
            if (res?.progressNote) {
                setProgressNotes(prev => [...prev, res.progressNote]);
                setNewProgressForm({
                    recordedAt: toDateTimeLocalValue(),
                    sheetNo: newProgressForm.sheetNo || '1',
                    note: ''
                });
                toast.success('Progress note saved');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save progress note');
        } finally {
            setSavingProgress(false);
        }
    };

    const handleSaveProgressEdit = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId || !editingProgress) return;
        if (!editingProgress.note.trim()) return toast.error('Progress note text cannot be empty');

        setSavingProgress(true);
        try {
            const res = await ipdClinicalAPI.editProgressNote(effectiveAdmissionId, editingProgress._id, {
                recordedAt: editingProgress.recordedAt ? new Date(editingProgress.recordedAt).toISOString() : undefined,
                sheetNo: editingProgress.sheetNo || '1',
                note: editingProgress.note.trim(),
                editReason: editingProgress.editReason?.trim() || 'Clinical update'
            });
            if (res?.progressNote) {
                setProgressNotes(prev => prev.map(n => (String(n._id) === String(res.progressNote._id) ? res.progressNote : n)));
                setEditingProgress(null);
                toast.success('Progress note updated with edit history');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update progress note');
        } finally {
            setSavingProgress(false);
        }
    };

    const canEditProgressEntry = (entry) => {
        const myId = user?._id || user?.userId;
        if (entry?.authorId && myId && String(entry.authorId) === String(myId)) return true;
        return isDoctorOrAdmin || sanitizedRole === 'headnurse';
    };

    // ==================== DRUG CHART SECTION A/B/C HANDLERS ====================
    const handleSaveAllergy = async (e) => {
        if (e) e.preventDefault();
        if (!effectiveAdmissionId) return toast.error('Active IPD admission required');
        setSavingAllergy(true);
        try {
            const res = await ipdClinicalAPI.saveDrugChartAllergies(effectiveAdmissionId, allergyForm);
            if (res?.drugChart) {
                setDrugChart(res.drugChart);
                toast.success('Drug allergies updated for Drug Chart');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update drug allergies');
        } finally {
            setSavingAllergy(false);
        }
    };

    const handleAddStatDose = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId) return toast.error('Active IPD admission required');
        if (!statForm.drugName.trim()) return toast.error('Prescribed drug name is required');
        setSavingStat(true);
        try {
            const res = await ipdClinicalAPI.addDrugChartStatDose(effectiveAdmissionId, statForm);
            if (res?.drugChart) {
                setDrugChart(res.drugChart);
                setStatForm(prev => ({
                    ...prev,
                    drugName: '',
                    dose: '',
                    remarks: ''
                }));
                setShowStatForm(false);
                toast.success('STAT prescription added (Pending Nursing Administration)');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add STAT order');
        } finally {
            setSavingStat(false);
        }
    };

    const handleSubmitStatAction = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId || !statActionModal?.entry) return;
        const { entry, mode, form } = statActionModal;

        // If this STAT dose came from InpatientOrder without a DrugChart subdoc yet, create & notify or handle
        if (entry.fromOrderOnly) {
            toast.error('Please prescribe/link STAT dose in Drug Chart or ask Doctor to add to Drug Chart first.');
            return;
        }

        setSavingStat(true);
        try {
            const payload = { ...form };
            if (mode === 'administer') {
                payload.confirmAdministration = true;
            } else if (mode === 'correct') {
                payload.isCorrection = true;
            }
            const res = await ipdClinicalAPI.updateDrugChartStatDose(effectiveAdmissionId, entry._id, payload);
            if (res?.drugChart) {
                setDrugChart(res.drugChart);
                setStatActionModal(null);
                toast.success('STAT dose updated');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update STAT dose');
        } finally {
            setSavingStat(false);
        }
    };

    const handleAddIVFluid = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId) return toast.error('Active IPD admission required');
        if (!ivForm.fluidName.trim()) return toast.error('Fluid name is required');
        setSavingIv(true);
        try {
            const res = await ipdClinicalAPI.addDrugChartIVFluid(effectiveAdmissionId, ivForm);
            if (res?.drugChart) {
                setDrugChart(res.drugChart);
                setIvForm(prev => ({
                    ...prev,
                    fluidName: '',
                    infusionTimeHrs: '',
                    remarks: ''
                }));
                setShowIvForm(false);
                toast.success('IV fluid entry added');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save IV fluid entry');
        } finally {
            setSavingIv(false);
        }
    };

    const handleSubmitIvAction = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId || !ivActionModal?.entry) return;
        const { entry, mode, form } = ivActionModal;
        if (entry.fromOrderOnly) {
            toast.error('Please add this IV Fluid row into Drug Chart to record chart administration.');
            return;
        }
        const isFinalized = mode === 'edit' || ['COMPLETED', 'HELD', 'NOT_GIVEN'].includes(entry.status);
        if (isFinalized && !String(form.editReason || '').trim()) {
            toast.error('Correction reason is required to amend a finalized IV fluid record.');
            return;
        }
        setSavingIv(true);
        try {
            const res = await ipdClinicalAPI.updateDrugChartIVFluid(effectiveAdmissionId, entry._id, {
                ...form,
                isCorrection: isFinalized
            });
            if (res?.drugChart) {
                setDrugChart(res.drugChart);
                setIvActionModal(null);
                toast.success('IV fluid entry updated');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update IV fluid entry');
        } finally {
            setSavingIv(false);
        }
    };

    // ==================== PAGE 2 MAR GRID CELL HANDLERS ====================
    const openMarCellPopup = (order, dateKey, slot) => {
        if (isBlank) return;
        const existingMar = marCellLookup.get(`${String(order._id)}::${dateKey}::${slot}`) || null;
        const completed = existingMar && ['ADMINISTERED', 'HELD', 'REFUSED', 'MISSED', 'NOT_GIVEN'].includes(String(existingMar.status).toUpperCase());

        const defaultStatus = existingMar
            ? (existingMar.status === 'MISSED' ? 'NOT_GIVEN' : existingMar.status)
            : 'ADMINISTERED';

        setExpandedMarAudit(false);
        setMarCellModal({
            order,
            dateKey,
            slot,
            existingMar,
            isCorrection: Boolean(completed),
            status: defaultStatus,
            administeredTime: toDateTimeLocalValue(existingMar?.administeredTime || new Date()),
            actualDoseValue: existingMar?.actualDoseValue ?? order.dosageValue ?? '',
            actualDoseUnit: existingMar?.actualDoseUnit || order.dosageUnit || '',
            route: existingMar?.route || order.route || 'Oral',
            notes: existingMar?.notes || '',
            reason: existingMar?.reason || '',
            correctionReason: ''
        });
    };

    const handleSubmitMarCell = async (e) => {
        e.preventDefault();
        if (!effectiveAdmissionId || !marCellModal) return;
        if (!canNurseAdminister) {
            return toast.error('Only authorized nursing staff can confirm medication administration.');
        }

        const { order, dateKey, slot, existingMar, isCorrection, status, administeredTime, actualDoseValue, actualDoseUnit, route, notes, reason, correctionReason } = marCellModal;

        if (['HELD', 'REFUSED', 'NOT_GIVEN', 'MISSED'].includes(status) && !reason.trim()) {
            return toast.error(`Please enter a clinical reason for marking status as ${status}.`);
        }
        if (isCorrection && !correctionReason.trim()) {
            return toast.error('Correction reason is required to amend a completed medication administration.');
        }

        setSavingMarCell(true);
        try {
            const payload = {
                status,
                administeredTime: administeredTime ? new Date(administeredTime).toISOString() : undefined,
                actualDoseValue: actualDoseValue !== '' ? Number(actualDoseValue) : undefined,
                actualDoseUnit,
                actualDose: actualDoseValue !== '' ? `${actualDoseValue} ${actualDoseUnit || ''}`.trim() : '',
                route,
                notes: notes.trim(),
                reason: reason.trim()
            };

            let res;
            if (isCorrection && existingMar?._id) {
                res = await ipdClinicalAPI.correctDrugChartMAR(effectiveAdmissionId, existingMar._id, {
                    ...payload,
                    correctionReason: correctionReason.trim()
                });
            } else {
                res = await ipdClinicalAPI.administerDrugChartMAR(effectiveAdmissionId, {
                    ...payload,
                    orderId: order._id,
                    scheduledDateKey: dateKey,
                    scheduledSlot: slot
                });
            }

            if (res?.success) {
                toast.success(isCorrection ? 'Administration corrected with audit trail' : 'Medication administration recorded');
                setMarCellModal(null);
                await loadAllData();
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to record medication administration');
        } finally {
            setSavingMarCell(false);
        }
    };

    // ==================== PRINT & DOWNLOAD ====================
    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const currentStrokes = penStrokesRef.current || penStrokes;
            if (activeTab === 'progress_notes') {
                await downloadProgressNotesPdf({
                    hospital: hospitalObj,
                    patient: initialPatient || admission?.patientId,
                    admission,
                    progressNotes,
                    handwritingStrokes: currentStrokes,
                    manualExtraSheets: manualExtraPages,
                    isBlank
                });
                toast.success('Progress Notes PDF downloaded');
            } else {
                await downloadDrugChartPdf({
                    hospital: hospitalObj,
                    patient: initialPatient || admission?.patientId,
                    admission,
                    drugChart,
                    existingAllergies,
                    orders,
                    marRecords,
                    handwritingStrokes: currentStrokes,
                    isBlank
                });
                toast.success('2-Page Drug Chart PDF downloaded');
            }
        } catch (err) {
            toast.error('Failed to generate PDF');
        } finally {
            setDownloading(false);
        }
    };

    const handlePrint = () => {
        const currentStrokes = penStrokesRef.current || penStrokes;
        if (activeTab === 'progress_notes') {
            printProgressNotes({
                hospital: hospitalObj,
                patient: initialPatient || admission?.patientId,
                admission,
                progressNotes,
                handwritingStrokes: currentStrokes,
                manualExtraSheets: manualExtraPages,
                isBlank
            });
        } else {
            printDrugChart({
                hospital: hospitalObj,
                patient: initialPatient || admission?.patientId,
                admission,
                drugChart,
                existingAllergies,
                orders,
                marRecords,
                handwritingStrokes: currentStrokes,
                isBlank
            });
        }
    };

    if (!isOpen) return null;

    const progressPages = isBlank
        ? paginateProgressNotes([], PROGRESS_ROWS_PER_PAGE, manualExtraPages)
        : paginateProgressNotes(progressNotes, PROGRESS_ROWS_PER_PAGE, manualExtraPages);

    const isAccredited = hospitalObj.accreditation?.enabled === true;
    const rawCert = isAccredited && hospitalObj.accreditation?.certNo ? String(hospitalObj.accreditation.certNo).trim() : '';
    const certText = rawCert ? (/^cert\.?\s*no/i.test(rawCert) ? rawCert : `Cert. No. : ${rawCert}`) : '';
    const hospLogoUrl = hospitalObj.logoUrl || hospitalObj.logo || '';
    const hospName = hospitalObj.name || hospitalObj.appName || 'Hospital';

    const renderPatientStrip = () => {
        return (
            <div className="ipdc-banner dc-p2-banner">
                <span>Patient Name : {ptDetails.name || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>MRN : {ptDetails.uhid || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>IPD : {ptDetails.ipdNumber || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Age : {ptDetails.age || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Sex : {ptDetails.gender || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>DOA : {headerData.doa || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Ward/Bed : {headerData.wardBed || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Consultant : {headerData.consultant || '—'}</span>
            </div>
        );
    };

    const renderDrugPage2PatientStrip = () => {
        return (
            <div className="ipdc-banner dc-p2-banner">
                <span>Patient Name : {ptDetails.name || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>MRN : {ptDetails.uhid || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>IPD : {ptDetails.ipdNumber || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Age : {ptDetails.age || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Sex : {ptDetails.gender || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>DOA : {headerData.doa || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Ward/Bed : {headerData.wardBed || '—'}</span>
                <span className="ipdc-sep">|</span>
                <span>Consultant : {headerData.consultant || '—'}</span>
            </div>
        );
    };

    const marTotalMm = DRUG_CHART_PAGE2_SUBCOLS_MM.reduce((s, w) => s + w, 0) + 16 * DRUG_CHART_PAGE2_SLOT_MM;
    const renderDrugPage2ColGroup = () => (
        <colgroup>
            {DRUG_CHART_PAGE2_SUBCOLS_MM.map((w, idx) => (
                <col key={`sub-${idx}`} style={{ width: `${((w / marTotalMm) * 100).toFixed(4)}%` }} />
            ))}
            {Array.from({ length: 16 }, (_, idx) => (
                <col key={`slot-${idx}`} style={{ width: `${((DRUG_CHART_PAGE2_SLOT_MM / marTotalMm) * 100).toFixed(4)}%` }} />
            ))}
        </colgroup>
    );

    const renderExactLetterhead = () => (
        <div className="ipdc-letterhead">
            <div className="ipdc-logos">
                {isAccredited && (
                    <div className="ipdc-nabh">
                        <img src={COMMON_NABH_LOGO_URL} alt="NABH" />
                        {certText && <div className="ipdc-cert">{certText}</div>}
                    </div>
                )}
                <div className="ipdc-hosp">
                    {hospLogoUrl ? (
                        <img src={hospLogoUrl} alt={hospName} />
                    ) : (
                        <div className="ipdc-hosp-name">{hospName}</div>
                    )}
                </div>
            </div>
            <div className="ipdc-info-box">
                <div className="ipdc-info-row">
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">Name</span>
                        <span className="ipdc-fill">{headerData.name}</span>
                    </div>
                </div>
                <div className="ipdc-info-row row-3">
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">Age</span>
                        <span className="ipdc-fill">{headerData.age}</span>
                    </div>
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">Sex</span>
                        <span className="ipdc-fill">{headerData.sex}</span>
                    </div>
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">DOA</span>
                        <span className="ipdc-fill">{headerData.doa}</span>
                    </div>
                </div>
                <div className="ipdc-info-row row-2">
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">Registration No.</span>
                        <span className="ipdc-fill">{headerData.regdNo}</span>
                    </div>
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">IPD No</span>
                        <span className="ipdc-fill">{headerData.ipdNo}</span>
                    </div>
                </div>
                <div className="ipdc-info-row">
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">Ward/Bed</span>
                        <span className="ipdc-fill">{headerData.wardBed}</span>
                    </div>
                </div>
                <div className="ipdc-info-row">
                    <div className="ipdc-info-field">
                        <span className="ipdc-lbl">Consultant</span>
                        <span className="ipdc-fill">{headerData.consultant}</span>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(
        <div className="ipdc-overlay" onClick={onClose}>
            <div className="ipdc-modal" onClick={(e) => e.stopPropagation()}>
                {/* ── Modal Top Header ── */}
                <div className="ipdc-header">
                    <div className="ipdc-header-title">
                        <h3>
                            <FiFileText color="#0d9488" />
                            <span>IPD Clinical Progress Notes &amp; Drug Chart</span>
                        </h3>
                        <span className="ipdc-header-sub">
                            {isBlank
                                ? 'Blank Official Format Preview & Print'
                                : `${ptDetails.name} • IPD: ${ptDetails.ipdNumber} • ${headerData.wardBed || 'Inpatient'}`}
                        </span>
                    </div>

                    <div className="ipdc-header-actions">
                        <button type="button" className="ipdc-btn-outline" onClick={handlePrint}>
                            <FiPrinter size={14} /> <span>Print</span>
                        </button>
                        <button type="button" className="ipdc-btn-primary" onClick={handleDownloadPdf} disabled={downloading}>
                            <FiDownload size={14} /> <span>{downloading ? 'Generating…' : 'Download PDF'}</span>
                        </button>
                        <button type="button" className="ipdc-close-btn" onClick={onClose} title="Close">
                            <FiX size={18} />
                        </button>
                    </div>
                </div>



                {/* ── 2 Unified Clinical Document Tabs ── */}
                <div className="ipdc-tabs">
                    <button
                        type="button"
                        className={`ipdc-tab ${activeTab === 'progress_notes' ? 'active' : ''}`}
                        onClick={() => setActiveTab('progress_notes')}
                    >
                        <FiFileText size={14} />
                        <span>1. Progress Notes ({progressNotes.length})</span>
                    </button>
                    <button
                        type="button"
                        className={`ipdc-tab ${activeTab === 'drug_chart' ? 'active' : ''}`}
                        onClick={() => setActiveTab('drug_chart')}
                    >
                        <FiDroplet size={14} />
                        <span>2. Drug Chart (Page 1 &amp; Page 2)</span>
                    </button>
                </div>

                {/* ── Master Document Editing Toolbar (Word-like inline editing) ── */}
                {!isBlank && (
                    <div className="ipdc-doc-toolbar">
                        <div className="ipdc-toolbar-group">
                            <button
                                type="button"
                                className={`ipdc-tool-btn ${activeTool === 'type' ? 'active' : ''}`}
                                onClick={() => setActiveTool('type')}
                                title="Type directly on ruled lines and document cells"
                            >
                                <FiEdit2 size={13} />
                                <span>Type Mode</span>
                            </button>
                            {canUsePenTool && (
                                <>
                                    <button
                                        type="button"
                                        className={`ipdc-tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
                                        onClick={() => setActiveTool('pen')}
                                        title="Tablet pen / Stylus ink handwriting"
                                    >
                                        <span>✍️ Pen</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`ipdc-tool-btn ${activeTool === 'eraser' ? 'active' : ''}`}
                                        onClick={() => setActiveTool('eraser')}
                                        title="Erase handwriting ink strokes"
                                    >
                                        <span>🧹 Eraser</span>
                                    </button>

                                    {activeTool === 'pen' && (
                                        <div className="ipdc-toolbar-group" style={{ marginLeft: '4px', gap: '6px' }}>
                                            <div
                                                className={`ipdc-color-dot ${penColor === '#1d4ed8' ? 'selected' : ''}`}
                                                style={{ background: '#1d4ed8' }}
                                                onClick={() => setPenColor('#1d4ed8')}
                                                title="Medical Blue"
                                            />
                                            <div
                                                className={`ipdc-color-dot ${penColor === '#0f172a' ? 'selected' : ''}`}
                                                style={{ background: '#0f172a' }}
                                                onClick={() => setPenColor('#0f172a')}
                                                title="Black"
                                            />
                                            <div
                                                className={`ipdc-color-dot ${penColor === '#dc2626' ? 'selected' : ''}`}
                                                style={{ background: '#dc2626' }}
                                                onClick={() => setPenColor('#dc2626')}
                                                title="Red Alert"
                                            />
                                            <select
                                                value={penWidth}
                                                onChange={(e) => setPenWidth(Number(e.target.value))}
                                                style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                                            >
                                                <option value={1.5}>Fine (1.5px)</option>
                                                <option value={2.5}>Medium (2.5px)</option>
                                                <option value={4}>Bold (4px)</option>
                                            </select>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="ipdc-toolbar-group">
                            <button
                                type="button"
                                className="ipdc-tool-btn ipdc-tool-btn-ai"
                                onClick={() => setIsScribeModalOpen(true)}
                                title="AI Voice Scribe (Gemini 3.6 Flash)"
                            >
                                <FiZap size={13} />
                                <span>AI Voice Scribe</span>
                            </button>

                            <button
                                type="button"
                                className="ipdc-tool-btn"
                                onClick={handleUndo}
                                disabled={undoStack.length === 0}
                                title="Undo (Ctrl+Z)"
                            >
                                <FiRotateCcw size={12} />
                                <span>Undo</span>
                            </button>
                            <button
                                type="button"
                                className="ipdc-tool-btn"
                                onClick={handleRedo}
                                disabled={redoStack.length === 0}
                                title="Redo (Ctrl+Y)"
                            >
                                <FiRotateCw size={12} />
                                <span>Redo</span>
                            </button>

                            {activeTab === 'progress_notes' && (
                                <button
                                    type="button"
                                    className="ipdc-tool-btn"
                                    onClick={() => {
                                        setManualExtraPages(p => p + 1);
                                        toast.success(`Continuation Sheet ${progressPages.length + 1} added`);
                                    }}
                                    title="Add Continuation Sheet"
                                >
                                    <FiPlus size={12} />
                                    <span>Add Sheet</span>
                                </button>
                            )}

                            {activeTab === 'drug_chart' && (
                                <button
                                    type="button"
                                    className="ipdc-tool-btn"
                                    onClick={() => {
                                        setManualExtraDrugPages(p => p + 1);
                                        toast.success('Continuation Sheet added to Drug Chart');
                                    }}
                                    title="Add Continuation Sheet (MAR Page 2) to Drug Chart"
                                >
                                    <FiPlus size={12} />
                                    <span>Add Sheet</span>
                                </button>
                            )}

                            {activeTab === 'progress_notes' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    {lastSavedProgressTime && (
                                        <span style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>
                                            Saved {lastSavedProgressTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="ipdc-btn-save-inline"
                                        onClick={handleSaveAllInline}
                                        disabled={savingProgress || !dirtyNotes}
                                        title="Save Clinical Progress Notes to database"
                                    >
                                        <FiSave size={13} />
                                        <span>{savingProgress ? 'Saving…' : dirtyNotes ? 'Save Changes ●' : 'Notes Saved'}</span>
                                    </button>
                                </div>
                            )}

                            {activeTab === 'drug_chart' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    {lastSavedDrugChartTime && (
                                        <span style={{ fontSize: '11px', color: '#047857', fontWeight: 600 }}>
                                            Saved {lastSavedDrugChartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="ipdc-btn-save-inline"
                                        onClick={handleSaveDrugChartInline}
                                        disabled={savingDrugChart || !dirtyDrugChart}
                                        title="Save Drug Chart (STAT, IV Fluids & Allergies) to database"
                                    >
                                        <FiSave size={13} />
                                        <span>{savingDrugChart ? 'Saving…' : dirtyDrugChart ? 'Save Drug Chart ●' : 'Drug Chart Saved'}</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Main Content Body ── */}
                <div className="ipdc-body">
                    {loading && <div className="ipdc-loading">Loading clinical chart records…</div>}

                    {/* =========================================================
                        TAB 1: PROGRESS NOTES (MASTER INLINE RULED EDITOR)
                       ========================================================= */}
                    {!loading && activeTab === 'progress_notes' && (
                        <TabletSheetZoom>
<div className="ipdc-sheets-stack">
                            {progressPages.map((pg, idx) => (
                                <div key={idx} className="ipdc-a4-sheet ipdc-sheet-canvas-wrapper">
                                    {/* Tablet Stylus Pen & Eraser Overlay */}
                                    <TabletPenCanvas
                                        pageKey={`pn_page_${idx}`}
                                        strokes={penStrokes[`pn_page_${idx}`] || []}
                                        activeTool={canUsePenTool ? activeTool : 'type'}
                                        penColor={penColor}
                                        penWidth={penWidth}
                                        onSaveStrokes={(newStrokes) => handleSaveStrokes(`pn_page_${idx}`, newStrokes)}
                                    />

                                    {renderExactLetterhead()}
                                    <table className="pn-exact-table">
                                        <thead>
                                            <tr>
                                                <th className="pn-col-dt">Date &amp;<br />Time</th>
                                                <th>
                                                    <div className="pn-th-flex">
                                                        <span>Clinical Progress Notes</span>
                                                        <span className="pn-sheet-lbl">
                                                            Sheet No. <span className="pn-sheet-dots">{isBlank ? '' : pg.sheetNo}</span>
                                                        </span>
                                                    </div>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pg.rows.map((r, rIdx) => {
                                                const lineKey = `${idx}_${rIdx}`;
                                                return (
                                                    <tr key={rIdx} className="pn-ruled-tr">
                                                        <td className="pn-col-dt">
                                                            {isBlank ? '' : (r.dateTimeText || '')}
                                                        </td>
                                                        {isBlank ? (
                                                             <td className="pn-dt-blank">&nbsp;</td>
                                                        ) : r.isMeta ? (
                                                            <td className="pn-meta-cell">
                                                                <span className="pn-meta-text">{r.noteText}</span>
                                                            </td>
                                                        ) : (
                                                            <td
                                                                className="pn-input-cell"
                                                                onClick={() => inputsRef.current[lineKey]?.focus()}
                                                            >
                                                                <input
                                                                    ref={(el) => { if (el) inputsRef.current[lineKey] = el; }}
                                                                    className="pn-line-input"
                                                                    value={r.noteText || ''}
                                                                    placeholder={rIdx === 0 && !r.noteText ? 'Click here to write clinical progress note directly on line...' : ''}
                                                                    onChange={(e) => handleProgressRowTextChange(idx, rIdx, e.target.value, r)}
                                                                    onKeyDown={(e) => handleProgressRowKeyDown(e, idx, rIdx, r)}
                                                                    onFocus={() => handleProgressRowFocus(idx, rIdx)}
                                                                />
                                                                {activeFocusedKey === `pn_${idx}_${rIdx}` && (
                                                                    <div className="pn-line-actions">
                                                                        {Boolean(r.noteText && r.noteText.trim()) && (
                                                                            <button
                                                                                type="button"
                                                                                className="line-del-pill"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleClearProgressRow(idx, rIdx, r);
                                                                                }}
                                                                                title="Clear this line"
                                                                            >
                                                                                <FiTrash2 size={12} />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            className={`line-mic-pill ${dictatingKey === `pn_${idx}_${rIdx}` ? 'listening' : ''}`}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleToggleLineDictation(
                                                                                    `pn_${idx}_${rIdx}`,
                                                                                    r.noteText || '',
                                                                                    (v) => handleProgressRowTextChange(idx, rIdx, v, r)
                                                                                );
                                                                            }}
                                                                            title="Dictate here"
                                                                        >
                                                                            <FiMic size={14} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    <div className="pn-exact-footer">Progress Sheet Cond ......</div>
                                </div>
                            ))}
                        </div>
</TabletSheetZoom>
                    )}

                    {/* =========================================================
                        TAB 2: DRUG CHART (CONTINUOUS 2-PAGE DOCUMENT)
                       ========================================================= */}
                    {!loading && activeTab === 'drug_chart' && (
                        <TabletSheetZoom>
<div className="ipdc-sheets-stack">
                            {/* ── SHEET 1: PAGE 1 (ALLERGIES, STAT-DOSES & I.V. FLUIDS) ── */}
                            <div className="ipdc-a4-sheet ipdc-sheet-canvas-wrapper">
                                <TabletPenCanvas
                                    pageKey="dc_page_1"
                                    strokes={penStrokes['dc_page_1'] || []}
                                    activeTool={canUsePenTool ? activeTool : 'type'}
                                    penColor={penColor}
                                    penWidth={penWidth}
                                    onSaveStrokes={(newStrokes) => handleSaveStrokes('dc_page_1', newStrokes)}
                                />
                                {renderExactLetterhead()}

                                {/* Drug Allergy Line */}
                                <div className="dc-prev-allergy">
                                    <strong>DRUG ALLERGY :</strong>
                                    <span>1.</span>
                                    {isBlank ? (
                                        <span className="dc-prev-dots red" />
                                    ) : (
                                        <div className="dc-cell-wrapper" style={{ width: 'auto', display: 'inline-flex' }}>
                                            <input
                                                ref={(el) => { if (el) inputsRef.current['allergy_slot1'] = el; }}
                                                className="dc-inline-allergy-input"
                                                value={allergyForm.slot1}
                                                onChange={(e) => {
                                                    setDirtyDrugChart(true);
                                                    setAllergyForm(p => ({ ...p, slot1: e.target.value }));
                                                }}
                                                onFocus={() => setActiveFocusedKey('allergy_slot1')}
                                                placeholder={existingAllergies.combinedSuggestions?.[0] || 'Type allergy 1…'}
                                                title="Drug Allergy 1"
                                            />
                                            {activeFocusedKey === 'allergy_slot1' && (
                                                <button
                                                    type="button"
                                                    className={`line-mic-pill ${dictatingKey === 'allergy_slot1' ? 'listening' : ''}`}
                                                    onClick={() => handleToggleLineDictation('allergy_slot1', allergyForm.slot1, (v) => {
                                                        setDirtyDrugChart(true);
                                                        setAllergyForm(p => ({ ...p, slot1: v }));
                                                    })}
                                                    title="Dictate Allergy 1"
                                                >
                                                    <FiMic size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <span>2.</span>
                                    {isBlank ? (
                                        <span className="dc-prev-dots red" />
                                    ) : (
                                        <div className="dc-cell-wrapper" style={{ width: 'auto', display: 'inline-flex' }}>
                                            <input
                                                ref={(el) => { if (el) inputsRef.current['allergy_slot2'] = el; }}
                                                className="dc-inline-allergy-input"
                                                value={allergyForm.slot2}
                                                onChange={(e) => {
                                                    setDirtyDrugChart(true);
                                                    setAllergyForm(p => ({ ...p, slot2: e.target.value }));
                                                }}
                                                onFocus={() => setActiveFocusedKey('allergy_slot2')}
                                                placeholder={existingAllergies.combinedSuggestions?.[1] || 'Type allergy 2…'}
                                                title="Drug Allergy 2"
                                            />
                                            {activeFocusedKey === 'allergy_slot2' && (
                                                <button
                                                    type="button"
                                                    className={`line-mic-pill ${dictatingKey === 'allergy_slot2' ? 'listening' : ''}`}
                                                    onClick={() => handleToggleLineDictation('allergy_slot2', allergyForm.slot2, (v) => {
                                                        setDirtyDrugChart(true);
                                                        setAllergyForm(p => ({ ...p, slot2: v }));
                                                    })}
                                                    title="Dictate Allergy 2"
                                                >
                                                    <FiMic size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <span>Sheet No.</span>
                                    {isBlank ? (
                                        <span className="dc-prev-dots sm" />
                                    ) : (
                                        <input
                                            className="dc-inline-allergy-sheet"
                                            value={allergyForm.sheetNo}
                                            onChange={(e) => {
                                                setDirtyDrugChart(true);
                                                setAllergyForm(p => ({ ...p, sheetNo: e.target.value }));
                                            }}
                                        />
                                    )}
                                    {!isBlank && (
                                        <button
                                            type="button"
                                            className="ipdc-btn-save-allergy"
                                            onClick={handleSaveDrugChartInline}
                                            disabled={savingDrugChart}
                                            title="Save Drug Chart &amp; Allergies"
                                        >
                                            <FiSave size={11} /> <span>{savingDrugChart ? 'Saving…' : 'Save'}</span>
                                        </button>
                                    )}
                                </div>

                                {/* Section A: ONCE-ONLY PRESCRIPTION (STAT-DOSES) */}
                                <div className="dc-section-hdr-row">
                                    <div className="dc-prev-sec-title">SECTION A — ONCE-ONLY PRESCRIPTION (STAT-DOSES)</div>
                                    {isDoctorOrAdmin && !isBlank && (
                                        <button
                                            type="button"
                                            className="dc-btn-add-stat"
                                            onClick={() => {
                                                setDirtyDrugChart(true);
                                                setEditableStatRows(prev => [
                                                    ...prev,
                                                    {
                                                        _id: null,
                                                        date: '',
                                                        time: '',
                                                        drugName: '',
                                                        dose: '',
                                                        route: '',
                                                        doctorName: '',
                                                        givenByName: '',
                                                        checkedByName: '',
                                                        remarks: '',
                                                        status: 'PENDING',
                                                        isNew: true
                                                    }
                                                ]);
                                            }}
                                            title="Add a new blank STAT row"
                                        >
                                            <FiPlus size={12} /> <span>Add STAT Row</span>
                                        </button>
                                    )}
                                </div>

                                <table className="dc-prev-table">
                                    <colgroup>
                                        {STAT_COLS.map(c => (
                                            <col key={c.key} style={{ width: c.widthPct }} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            {STAT_COLS.map(c => (
                                                <th key={c.key} style={{ width: c.widthPct }}>
                                                    {c.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editableStatRows.slice(0, Math.max(10, editableStatRows.length)).map((s, rIdx) => {
                                            if (isBlank) {
                                                return (
                                                    <tr key={rIdx}>
                                                        <td className="c">&nbsp;</td><td>&nbsp;</td><td className="c">&nbsp;</td>
                                                        <td className="c">&nbsp;</td><td className="c">&nbsp;</td><td>&nbsp;</td>
                                                        <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr key={s._id || rIdx}>
                                                    {/* 1. Date */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_date`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={s.date || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'date', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_date`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'date')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 2. Drug Name */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_drugName`] = el; }}
                                                                className="dc-cell-input bold"
                                                                value={s.drugName || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'drugName', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_drugName`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'drugName')}
                                                            />
                                                            {activeFocusedKey === `stat_${rIdx}_drugName` && (
                                                                <button
                                                                    type="button"
                                                                    className={`line-mic-pill ${dictatingKey === `stat_${rIdx}_drugName` ? 'listening' : ''}`}
                                                                    onClick={() => handleToggleLineDictation(`stat_${rIdx}_drugName`, s.drugName, (v) => handleStatCellChange(rIdx, 'drugName', v))}
                                                                    title="Dictate Drug Name"
                                                                >
                                                                    <FiMic size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* 3. Dose */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_dose`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={s.dose || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'dose', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_dose`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'dose')}
                                                            />
                                                            {activeFocusedKey === `stat_${rIdx}_dose` && (
                                                                <button
                                                                    type="button"
                                                                    className={`line-mic-pill ${dictatingKey === `stat_${rIdx}_dose` ? 'listening' : ''}`}
                                                                    onClick={() => handleToggleLineDictation(`stat_${rIdx}_dose`, s.dose, (v) => handleStatCellChange(rIdx, 'dose', v), true)}
                                                                    title="Dictate Dose (numeric)"
                                                                >
                                                                    <FiMic size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* 4. Route */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_route`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={s.route || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'route', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_route`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'route')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 5. Time */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_time`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={s.time || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'time', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_time`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'time')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 6. Doctor */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_doctorName`] = el; }}
                                                                className="dc-cell-input"
                                                                value={s.doctorName || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'doctorName', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_doctorName`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'doctorName')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 7. Given By */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            {s.drugName && !s.givenByName && canNurseAdminister && s.status === 'PENDING' ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="dc-mini-give-btn"
                                                                        style={{ margin: 0, padding: '2px 5px', fontSize: '10px' }}
                                                                        onClick={() => {
                                                                            handleStatCellChange(rIdx, 'givenByName', user?.name || 'Staff');
                                                                            handleStatCellChange(rIdx, 'status', 'ADMINISTERED');
                                                                        }}
                                                                    >
                                                                        <FiCheck size={10} /> Give
                                                                    </button>
                                                                    <input
                                                                        ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_givenByName`] = el; }}
                                                                        className="dc-cell-input"
                                                                        value={s.givenByName || ''}
                                                                        onChange={(e) => handleStatCellChange(rIdx, 'givenByName', e.target.value)}
                                                                        onFocus={() => setActiveFocusedKey(`stat_${rIdx}_givenByName`)}
                                                                        onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'givenByName')}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <input
                                                                    ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_givenByName`] = el; }}
                                                                    className="dc-cell-input"
                                                                    value={s.givenByName || ''}
                                                                    onChange={(e) => handleStatCellChange(rIdx, 'givenByName', e.target.value)}
                                                                    onFocus={() => setActiveFocusedKey(`stat_${rIdx}_givenByName`)}
                                                                    onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'givenByName')}
                                                                />
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* 8. Checked by */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_checkedByName`] = el; }}
                                                                className="dc-cell-input"
                                                                value={s.checkedByName || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'checkedByName', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_checkedByName`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'checkedByName')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 9. Remarks */}
                                                    <td>
                                                        <div className="dc-cell-inner" style={{ gap: '2px' }}>
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`stat_${rIdx}_remarks`] = el; }}
                                                                className="dc-cell-input"
                                                                value={s.remarks || ''}
                                                                onChange={(e) => handleStatCellChange(rIdx, 'remarks', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`stat_${rIdx}_remarks`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'stat', rIdx, 'remarks')}
                                                                style={{ flex: 1 }}
                                                            />
                                                            {activeFocusedKey === `stat_${rIdx}_remarks` && (
                                                                <button
                                                                    type="button"
                                                                    className={`line-mic-pill ${dictatingKey === `stat_${rIdx}_remarks` ? 'listening' : ''}`}
                                                                    onClick={() => handleToggleLineDictation(`stat_${rIdx}_remarks`, s.remarks, (v) => handleStatCellChange(rIdx, 'remarks', v))}
                                                                    title="Dictate Remarks"
                                                                >
                                                                    <FiMic size={14} />
                                                                </button>
                                                            )}
                                                            {isDoctorOrAdmin && !isBlank && (s.drugName || s._id) && (
                                                                <button
                                                                    type="button"
                                                                    className="dc-row-del-btn"
                                                                    onClick={() => handleDeleteStatRow(rIdx)}
                                                                    title="Delete / clear this STAT dose row"
                                                                >
                                                                    <FiTrash2 size={11} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Section B: I.V. FLUIDS */}
                                <div className="dc-section-hdr-row" style={{ marginTop: '14px' }}>
                                    <div className="dc-prev-sec-title">SECTION B — I.V. FLUIDS</div>
                                    {!isBlank && (
                                        <button
                                            type="button"
                                            className="dc-btn-add-stat"
                                            onClick={() => {
                                                setDirtyDrugChart(true);
                                                setEditableIvRows(prev => [
                                                    ...prev,
                                                    {
                                                        _id: null,
                                                        date: '',
                                                        fluidName: '',
                                                        volume: '',
                                                        timeStart: '',
                                                        infusionTimeHrs: '',
                                                        doctorName: '',
                                                        adminByName: '',
                                                        remarks: '',
                                                        status: 'PENDING',
                                                        isNew: true
                                                    }
                                                ]);
                                            }}
                                            title="Add a new blank IV Fluid row"
                                        >
                                            <FiPlus size={12} /> <span>Add IV Row</span>
                                        </button>
                                    )}
                                </div>

                                <table className="dc-prev-table iv">
                                    <colgroup>
                                        {IV_COLS.map(c => (
                                            <col key={c.key} style={{ width: c.widthPct }} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            {IV_COLS.map(c => (
                                                <th key={c.key} style={{ width: c.widthPct }}>
                                                    {c.key === 'infusionTimeHrs' ? <>Infusion<br />time(hrs.)</> : c.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editableIvRows.slice(0, Math.max(8, editableIvRows.length)).map((iv, rIdx) => {
                                            if (isBlank) {
                                                return (
                                                    <tr key={rIdx}>
                                                        <td className="c">&nbsp;</td><td>&nbsp;</td><td className="c">&nbsp;</td>
                                                        <td className="c">&nbsp;</td><td className="c">&nbsp;</td><td>&nbsp;</td>
                                                        <td>&nbsp;</td><td>&nbsp;</td>
                                                    </tr>
                                                );
                                            }
                                            return (
                                                <tr key={iv._id || rIdx}>
                                                    {/* 1. Date */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_date`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={iv.date || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'date', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_date`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'date')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 2. Fluid Name */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_fluidName`] = el; }}
                                                                className="dc-cell-input bold"
                                                                value={iv.fluidName || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'fluidName', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_fluidName`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'fluidName')}
                                                            />
                                                            {activeFocusedKey === `iv_${rIdx}_fluidName` && (
                                                                <button
                                                                    type="button"
                                                                    className={`line-mic-pill ${dictatingKey === `iv_${rIdx}_fluidName` ? 'listening' : ''}`}
                                                                    onClick={() => handleToggleLineDictation(`iv_${rIdx}_fluidName`, iv.fluidName, (v) => handleIvCellChange(rIdx, 'fluidName', v))}
                                                                    title="Dictate Fluid Name"
                                                                >
                                                                    <FiMic size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* 3. Volume */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_volume`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={iv.volume || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'volume', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_volume`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'volume')}
                                                            />
                                                            {activeFocusedKey === `iv_${rIdx}_volume` && (
                                                                <button
                                                                    type="button"
                                                                    className={`line-mic-pill ${dictatingKey === `iv_${rIdx}_volume` ? 'listening' : ''}`}
                                                                    onClick={() => handleToggleLineDictation(`iv_${rIdx}_volume`, iv.volume, (v) => handleIvCellChange(rIdx, 'volume', v), true)}
                                                                    title="Dictate Volume (numeric)"
                                                                >
                                                                    <FiMic size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* 4. Time Start */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_timeStart`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={iv.timeStart || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'timeStart', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_timeStart`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'timeStart')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 5. Infusion time hrs */}
                                                    <td className="c">
                                                        <div className="dc-cell-inner c">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_infusionTimeHrs`] = el; }}
                                                                className="dc-cell-input c"
                                                                value={iv.infusionTimeHrs || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'infusionTimeHrs', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_infusionTimeHrs`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'infusionTimeHrs')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 6. Doctor */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_doctorName`] = el; }}
                                                                className="dc-cell-input"
                                                                value={iv.doctorName || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'doctorName', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_doctorName`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'doctorName')}
                                                            />
                                                        </div>
                                                    </td>
                                                    {/* 7. Admin.by */}
                                                    <td>
                                                        <div className="dc-cell-inner">
                                                            {iv.fluidName && !iv.adminByName && canNurseAdminister && iv.status === 'PENDING' ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="dc-mini-give-btn"
                                                                        style={{ margin: 0, padding: '2px 5px', fontSize: '10px' }}
                                                                        onClick={() => {
                                                                            handleIvCellChange(rIdx, 'adminByName', user?.name || 'Staff');
                                                                            handleIvCellChange(rIdx, 'status', 'RUNNING');
                                                                        }}
                                                                    >
                                                                        <FiCheck size={10} /> Start
                                                                    </button>
                                                                    <input
                                                                        ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_adminByName`] = el; }}
                                                                        className="dc-cell-input"
                                                                        value={iv.adminByName || ''}
                                                                        onChange={(e) => handleIvCellChange(rIdx, 'adminByName', e.target.value)}
                                                                        onFocus={() => setActiveFocusedKey(`iv_${rIdx}_adminByName`)}
                                                                        onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'adminByName')}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <input
                                                                    ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_adminByName`] = el; }}
                                                                    className="dc-cell-input"
                                                                    value={iv.adminByName || ''}
                                                                    onChange={(e) => handleIvCellChange(rIdx, 'adminByName', e.target.value)}
                                                                    onFocus={() => setActiveFocusedKey(`iv_${rIdx}_adminByName`)}
                                                                    onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'adminByName')}
                                                                />
                                                            )}
                                                        </div>
                                                    </td>
                                                    {/* 8. Remarks */}
                                                    <td>
                                                        <div className="dc-cell-inner" style={{ gap: '2px' }}>
                                                            <input
                                                                ref={(el) => { if (el) inputsRef.current[`iv_${rIdx}_remarks`] = el; }}
                                                                className="dc-cell-input"
                                                                value={iv.remarks || ''}
                                                                onChange={(e) => handleIvCellChange(rIdx, 'remarks', e.target.value)}
                                                                onFocus={() => setActiveFocusedKey(`iv_${rIdx}_remarks`)}
                                                                onKeyDown={(e) => handleCellNav(e, 'iv', rIdx, 'remarks')}
                                                                style={{ flex: 1 }}
                                                            />
                                                            {activeFocusedKey === `iv_${rIdx}_remarks` && (
                                                                <button
                                                                    type="button"
                                                                    className={`line-mic-pill ${dictatingKey === `iv_${rIdx}_remarks` ? 'listening' : ''}`}
                                                                    onClick={() => handleToggleLineDictation(`iv_${rIdx}_remarks`, iv.remarks, (v) => handleIvCellChange(rIdx, 'remarks', v))}
                                                                    title="Dictate Remarks"
                                                                >
                                                                    <FiMic size={14} />
                                                                </button>
                                                            )}
                                                            {!isBlank && (iv.fluidName || iv._id) && (
                                                                <button
                                                                    type="button"
                                                                    className="dc-row-del-btn"
                                                                    onClick={() => handleDeleteIvRow(rIdx)}
                                                                    title="Delete / clear this IV fluid row"
                                                                >
                                                                    <FiTrash2 size={11} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* ── SHEET 2: PAGE 2 (SECTION C — REGULAR MEDICATION ADMINISTRATION CHART) ── */}
                            <div className="ipdc-a4-sheet ipdc-sheet-canvas-wrapper" style={{ marginTop: '18px' }}>
                                <TabletPenCanvas
                                    pageKey="dc_page_2"
                                    strokes={penStrokes['dc_page_2'] || []}
                                    activeTool={canUsePenTool ? activeTool : 'type'}
                                    penColor={penColor}
                                    penWidth={penWidth}
                                    onSaveStrokes={(newStrokes) => handleSaveStrokes('dc_page_2', newStrokes)}
                                />
                                {renderDrugPage2PatientStrip()}

                                <div className="ipdc-card-header wrap" style={{ padding: '6px 0', border: 'none', background: 'transparent' }}>
                                    <div>
                                        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <FiShield color="#0d9488" size={14} />
                                            <span>SECTION C — REGULAR MEDICATION ADMINISTRATION CHART (06 AM · 10 AM · 02 PM · 10 PM)</span>
                                        </h4>
                                    </div>
                                    <div className="ipdc-day-nav" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button
                                            type="button"
                                            className="ipdc-btn-outline sm"
                                            disabled={dayWindowIdx <= 0}
                                            onClick={() => setDayWindowIdx(i => Math.max(0, i - 1))}
                                            style={{ padding: '3px 8px', fontSize: '11px', minHeight: '26px' }}
                                        >
                                            <FiChevronLeft size={12} /> Prev 4 Days
                                        </button>
                                        <span className="day-range-lbl" style={{ fontSize: '11px', fontWeight: 600 }}>
                                            {formatDateDisplay(activeFourDates[0])} – {formatDateDisplay(activeFourDates[3])}
                                        </span>
                                        <button
                                            type="button"
                                            className="ipdc-btn-outline sm"
                                            disabled={dayWindowIdx >= dateWindows.length - 1}
                                            onClick={() => setDayWindowIdx(i => Math.min(dateWindows.length - 1, i + 1))}
                                            style={{ padding: '3px 8px', fontSize: '11px', minHeight: '26px' }}
                                        >
                                            Next 4 Days <FiChevronRight size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Status Legend */}
                                <div className="mar-legend" style={{ margin: '4px 0 8px 0', padding: '4px 8px', fontSize: '11px' }}>
                                    <span className="lg-item lg-given">Given</span>
                                    <span className="lg-item lg-pending">Pending</span>
                                    <span className="lg-item lg-not-given">Not Given</span>
                                    <span className="lg-item lg-refused">Refused</span>
                                    <span className="lg-item lg-held">Held</span>
                                    <span className="lg-note">Tap any slot cell to record administration. Tablet stylus supported.</span>
                                </div>

                                {/* Interactive MAR Table matching original DRUG CHART(2).pdf Page 2 */}
                                <div className="mar-grid-scroll">
                                    <table className="mar-interactive-table">
                                        <thead>
                                            <tr>
                                                <th colSpan={4} className="dc-mar-top-date-lbl" style={{ width: '33.33%' }}>Date</th>
                                                {activeFourDates.map((dKey) => (
                                                    <th key={dKey} colSpan={4} className="day-group-hdr" style={{ width: '16.67%' }}>
                                                        {formatDateDisplay(dKey)}
                                                    </th>
                                                ))}
                                            </tr>
                                            <tr>
                                                <th colSpan={4} className="dc-mar-top-time-lbl" style={{ width: '33.33%' }}>Time</th>
                                                {activeFourDates.map((dKey) => (
                                                    DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => (
                                                        <th key={`${dKey}-${slotName}`} className={`slot-hdr ${sIdx === 0 ? 'day-edge' : ''}`} style={{ width: '4.167%' }}>
                                                            {slotName}
                                                        </th>
                                                    ))
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {editableMedBlocks.slice(0, 12).map((blk, bIdx) => {
                                                const isInactive = ['CANCELLED', 'ON_HOLD', 'COMPLETED'].includes(blk.status);
                                                const orderObj = orders.find(o => String(o._id) === String(blk.orderId));
                                                return (
                                                    <React.Fragment key={blk._id || `block_${bIdx}`}>
                                                        {/* Sub-row 1: Drug Name (spanning 4 sub-columns) + 16 Time Slot cells with rowSpan={3} */}
                                                        <tr className={isInactive ? 'inactive-order-row' : ''}>
                                                            <td colSpan={4} className="dc-mar-drugname-td">
                                                                <div className="dc-mar-drugname-flex">
                                                                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, minWidth: '16px' }}>{bIdx + 1}.</span>
                                                                    <input
                                                                        ref={(el) => { if (el) inputsRef.current[`med_${bIdx}_name`] = el; }}
                                                                        className="dc-cell-input bold"
                                                                        value={blk.medicineName || ''}
                                                                        disabled={!isDoctorOrAdmin && blk.orderId}
                                                                        onChange={(e) => handleMedBlockChange(bIdx, 'medicineName', e.target.value)}
                                                                        onFocus={() => setActiveFocusedKey(`med_${bIdx}_name`)}
                                                                        style={{ flex: 1, textDecoration: isInactive ? 'line-through' : 'none', color: isInactive ? '#991b1b' : '#0f172a' }}
                                                                    />
                                                                    {blk.status && blk.orderId && (
                                                                        <span className={`ord-tag ord-${String(blk.status).toLowerCase()}`}>
                                                                            {blk.status === 'CANCELLED' ? 'Discontinued' : blk.status}
                                                                        </span>
                                                                    )}
                                                                    {activeFocusedKey === `med_${bIdx}_name` && (
                                                                        <button
                                                                            type="button"
                                                                            className={`line-mic-pill ${dictatingKey === `med_${bIdx}_name` ? 'listening' : ''}`}
                                                                            onClick={() => handleToggleLineDictation(`med_${bIdx}_name`, blk.medicineName, (v) => handleMedBlockChange(bIdx, 'medicineName', v))}
                                                                            title="Dictate Drug Name"
                                                                        >
                                                                            <FiMic size={14} />
                                                                        </button>
                                                                    )}
                                                                    {isDoctorOrAdmin && !isBlank && (blk.medicineName || blk.orderId) && (
                                                                        <button
                                                                            type="button"
                                                                            className="dc-row-del-btn"
                                                                            onClick={() => handleDiscontinueOrder(bIdx)}
                                                                            title={blk.orderId ? 'Discontinue / Cancel Medication Order' : 'Clear this draft block'}
                                                                        >
                                                                            <FiTrash2 size={11} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            {/* 16 MAR Time Slot Cells spanning 3 rows */}
                                                            {activeFourDates.map((dKey) => (
                                                                DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => {
                                                                    const marKey = blk.orderId ? `${String(blk.orderId)}::${dKey}::${slotName}` : null;
                                                                    const mar = marKey ? marCellLookup.get(marKey) : null;
                                                                    const st = formatMarCellStatus(mar);
                                                                    const canAdmin = canNurseAdminister && blk.orderId && blk.status === 'ACTIVE';

                                                                    return (
                                                                        <td
                                                                            key={`${bIdx}-${dKey}-${slotName}`}
                                                                            rowSpan={3}
                                                                            className={`mar-slot-td ${sIdx === 0 ? 'day-edge' : ''} ${mar ? `cell-${st.code.toLowerCase()}` : 'cell-empty'}`}
                                                                            onClick={() => {
                                                                                if (orderObj) {
                                                                                    openMarCellPopup(orderObj, dKey, slotName);
                                                                                } else if (!blk.orderId && blk.medicineName) {
                                                                                    toast('Save Drug Chart first to enable nursing administration on this new medication.', { icon: 'ℹ️' });
                                                                                }
                                                                            }}
                                                                            title={mar ? `${st.label}${mar.administeredByName ? ` by ${mar.administeredByName}` : ''}` : blk.medicineName ? `Record ${blk.medicineName} at ${slotName}` : 'Medication slot'}
                                                                        >
                                                                            {mar ? (
                                                                                <div className="cell-pill">
                                                                                    <span className="cell-st">{st.label}</span>
                                                                                    {mar.administeredTime && st.code === 'GIVEN' && (
                                                                                        <small>{formatShortTime(mar.administeredTime)}</small>
                                                                                    )}
                                                                                    {(mar.administeredByName || mar.administeredBy?.name) && (
                                                                                        <small className="cell-init">{getStaffInitials(mar.administeredByName || mar.administeredBy?.name)}</small>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="cell-plus">{canAdmin ? '+' : '·'}</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })
                                                            ))}
                                                        </tr>

                                                        {/* Sub-row 2: 4 Sub-column Headers */}
                                                        <tr className={isInactive ? 'inactive-order-row' : ''}>
                                                            <td className="dc-mar-subhdr-td" style={{ width: '6.77%' }}>Date</td>
                                                            <td className="dc-mar-subhdr-td" style={{ width: '6.25%' }}>Route</td>
                                                            <td className="dc-mar-subhdr-td" style={{ width: '7.29%' }}>Dose</td>
                                                            <td className="dc-mar-subhdr-td" style={{ width: '13.02%' }}>Prescribed by</td>
                                                        </tr>

                                                        {/* Sub-row 3: 4 Sub-column Editable Values */}
                                                        <tr className={isInactive ? 'inactive-order-row' : ''}>
                                                            <td className="dc-mar-subval-td">
                                                                <input
                                                                    ref={(el) => { if (el) inputsRef.current[`med_${bIdx}_date`] = el; }}
                                                                    className="dc-cell-input c"
                                                                    value={blk.startDate || ''}
                                                                    disabled={!isDoctorOrAdmin && blk.orderId}
                                                                    onChange={(e) => handleMedBlockChange(bIdx, 'startDate', e.target.value)}
                                                                    onFocus={() => setActiveFocusedKey(`med_${bIdx}_date`)}
                                                                />
                                                            </td>
                                                            <td className="dc-mar-subval-td">
                                                                <input
                                                                    ref={(el) => { if (el) inputsRef.current[`med_${bIdx}_route`] = el; }}
                                                                    className="dc-cell-input c"
                                                                    value={blk.route || ''}
                                                                    disabled={!isDoctorOrAdmin && blk.orderId}
                                                                    onChange={(e) => handleMedBlockChange(bIdx, 'route', e.target.value)}
                                                                    onFocus={() => setActiveFocusedKey(`med_${bIdx}_route`)}
                                                                />
                                                            </td>
                                                            <td className="dc-mar-subval-td">
                                                                <div className="dc-cell-wrapper">
                                                                    <input
                                                                        ref={(el) => { if (el) inputsRef.current[`med_${bIdx}_dose`] = el; }}
                                                                        className="dc-cell-input c bold"
                                                                        value={blk.dose || ''}
                                                                        disabled={!isDoctorOrAdmin && blk.orderId}
                                                                        onChange={(e) => handleMedBlockChange(bIdx, 'dose', e.target.value)}
                                                                        onFocus={() => setActiveFocusedKey(`med_${bIdx}_dose`)}
                                                                    />
                                                                    {activeFocusedKey === `med_${bIdx}_dose` && isDoctorOrAdmin && (
                                                                        <button
                                                                            type="button"
                                                                            className={`line-mic-pill ${dictatingKey === `med_${bIdx}_dose` ? 'listening' : ''}`}
                                                                            onClick={() => handleToggleLineDictation(`med_${bIdx}_dose`, blk.dose, (v) => handleMedBlockChange(bIdx, 'dose', v), true)}
                                                                            title="Dictate Dose (numeric)"
                                                                        >
                                                                            <FiMic size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="dc-mar-subval-td">
                                                                <input
                                                                    ref={(el) => { if (el) inputsRef.current[`med_${bIdx}_doctor`] = el; }}
                                                                    className="dc-cell-input"
                                                                    value={blk.doctorName || ''}
                                                                    disabled={!isDoctorOrAdmin && blk.orderId}
                                                                    onChange={(e) => handleMedBlockChange(bIdx, 'doctorName', e.target.value)}
                                                                    onFocus={() => setActiveFocusedKey(`med_${bIdx}_doctor`)}
                                                                />
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ── CONTINUATION SHEETS FOR DRUG CHART (PAGE 2) IF ADDED VIA + ADD SHEET ── */}
                            {Array.from({ length: manualExtraDrugPages }).map((_, extraPgIdx) => {
                                const startSlice = (extraPgIdx + 1) * 12;
                                const pageBlocks = editableMedBlocks.slice(startSlice, startSlice + 12);
                                return (
                                    <div key={`dc_cont_${extraPgIdx}`} className="ipdc-a4-sheet ipdc-sheet-canvas-wrapper" style={{ marginTop: '18px' }}>
                                        <TabletPenCanvas
                                            pageKey={`dc_page_2_cont_${extraPgIdx + 1}`}
                                            strokes={penStrokes[`dc_page_2_cont_${extraPgIdx + 1}`] || []}
                                            activeTool={canUsePenTool ? activeTool : 'type'}
                                            penColor={penColor}
                                            penWidth={penWidth}
                                            onSaveStrokes={(newStrokes) => handleSaveStrokes(`dc_page_2_cont_${extraPgIdx + 1}`, newStrokes)}
                                        />
                                        {renderDrugPage2PatientStrip()}

                                        <div className="ipdc-card-header wrap" style={{ padding: '6px 0', border: 'none', background: 'transparent' }}>
                                            <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FiShield color="#0d9488" size={14} />
                                                <span>SECTION C — REGULAR MEDICATION ADMINISTRATION (Continuation Sheet {extraPgIdx + 2})</span>
                                            </h4>
                                        </div>

                                        <div className="mar-grid-scroll">
                                            <table className="mar-interactive-table">
                                                <thead>
                                                    <tr>
                                                        <th colSpan={4} className="dc-mar-top-date-lbl" style={{ width: '33.33%' }}>Date</th>
                                                        {activeFourDates.map((dKey) => (
                                                            <th key={dKey} colSpan={4} className="day-group-hdr" style={{ width: '16.67%' }}>
                                                                {formatDateDisplay(dKey)}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                    <tr>
                                                        <th colSpan={4} className="dc-mar-top-time-lbl" style={{ width: '33.33%' }}>Time</th>
                                                        {activeFourDates.map((dKey) => (
                                                            DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => (
                                                                <th key={`${dKey}-${slotName}`} className={`slot-hdr ${sIdx === 0 ? 'day-edge' : ''}`} style={{ width: '4.167%' }}>
                                                                    {slotName}
                                                                </th>
                                                            ))
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pageBlocks.map((blk, pIdx) => {
                                                        const bIdx = startSlice + pIdx;
                                                        const isInactive = ['CANCELLED', 'ON_HOLD', 'COMPLETED'].includes(blk.status);
                                                        const orderObj = orders.find(o => String(o._id) === String(blk.orderId));
                                                        return (
                                                            <React.Fragment key={blk._id || `block_${bIdx}`}>
                                                                <tr className={isInactive ? 'inactive-order-row' : ''}>
                                                                    <td colSpan={4} className="dc-mar-drugname-td">
                                                                        <div className="dc-mar-drugname-flex">
                                                                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, minWidth: '16px' }}>{bIdx + 1}.</span>
                                                                            <input
                                                                                ref={(el) => { if (el) inputsRef.current[`med_${bIdx}_name`] = el; }}
                                                                                className="dc-cell-input bold"
                                                                                value={blk.medicineName || ''}
                                                                                disabled={!isDoctorOrAdmin && blk.orderId}
                                                                                onChange={(e) => handleMedBlockChange(bIdx, 'medicineName', e.target.value)}
                                                                                onFocus={() => setActiveFocusedKey(`med_${bIdx}_name`)}
                                                                                style={{ flex: 1, textDecoration: isInactive ? 'line-through' : 'none', color: isInactive ? '#991b1b' : '#0f172a' }}
                                                                            />
                                                                            {blk.status && blk.orderId && (
                                                                                <span className={`ord-tag ord-${String(blk.status).toLowerCase()}`}>
                                                                                    {blk.status === 'CANCELLED' ? 'Discontinued' : blk.status}
                                                                                </span>
                                                                            )}
                                                                            {isDoctorOrAdmin && !isBlank && (blk.medicineName || blk.orderId) && (
                                                                                <button
                                                                                    type="button"
                                                                                    className="dc-row-del-btn"
                                                                                    onClick={() => handleDiscontinueOrder(bIdx)}
                                                                                    title={blk.orderId ? 'Discontinue Medication' : 'Clear block'}
                                                                                >
                                                                                    <FiTrash2 size={11} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    {activeFourDates.map((dKey) => (
                                                                        DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => {
                                                                            const marKey = blk.orderId ? `${String(blk.orderId)}::${dKey}::${slotName}` : null;
                                                                            const mar = marKey ? marCellLookup.get(marKey) : null;
                                                                            const st = formatMarCellStatus(mar);
                                                                            const canAdmin = canNurseAdminister && blk.orderId && blk.status === 'ACTIVE';

                                                                            return (
                                                                                <td
                                                                                    key={`${bIdx}-${dKey}-${slotName}`}
                                                                                    rowSpan={3}
                                                                                    className={`mar-slot-td ${sIdx === 0 ? 'day-edge' : ''} ${mar ? `cell-${st.code.toLowerCase()}` : 'cell-empty'}`}
                                                                                    onClick={() => {
                                                                                        if (orderObj) openMarCellPopup(orderObj, dKey, slotName);
                                                                                    }}
                                                                                >
                                                                                    {mar ? (
                                                                                        <div className="cell-pill">
                                                                                            <span className="cell-st">{st.label}</span>
                                                                                            {mar.administeredTime && st.code === 'GIVEN' && (
                                                                                                <small>{formatShortTime(mar.administeredTime)}</small>
                                                                                            )}
                                                                                            {(mar.administeredByName || mar.administeredBy?.name) && (
                                                                                                <small className="cell-init">{getStaffInitials(mar.administeredByName || mar.administeredBy?.name)}</small>
                                                                                            )}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="cell-plus">{canAdmin ? '+' : '·'}</span>
                                                                                    )}
                                                                                </td>
                                                                            );
                                                                        })
                                                                    ))}
                                                                </tr>
                                                                <tr className={isInactive ? 'inactive-order-row' : ''}>
                                                                    <td className="dc-mar-subhdr-td" style={{ width: '6.77%' }}>Date</td>
                                                                    <td className="dc-mar-subhdr-td" style={{ width: '6.25%' }}>Route</td>
                                                                    <td className="dc-mar-subhdr-td" style={{ width: '7.29%' }}>Dose</td>
                                                                    <td className="dc-mar-subhdr-td" style={{ width: '13.02%' }}>Prescribed by</td>
                                                                </tr>
                                                                <tr className={isInactive ? 'inactive-order-row' : ''}>
                                                                    <td className="dc-mar-subval-td">
                                                                        <input
                                                                            className="dc-cell-input c"
                                                                            value={blk.startDate || ''}
                                                                            disabled={!isDoctorOrAdmin && blk.orderId}
                                                                            onChange={(e) => handleMedBlockChange(bIdx, 'startDate', e.target.value)}
                                                                        />
                                                                    </td>
                                                                    <td className="dc-mar-subval-td">
                                                                        <input
                                                                            className="dc-cell-input c"
                                                                            value={blk.route || ''}
                                                                            disabled={!isDoctorOrAdmin && blk.orderId}
                                                                            onChange={(e) => handleMedBlockChange(bIdx, 'route', e.target.value)}
                                                                        />
                                                                    </td>
                                                                    <td className="dc-mar-subval-td">
                                                                        <input
                                                                            className="dc-cell-input c bold"
                                                                            value={blk.dose || ''}
                                                                            disabled={!isDoctorOrAdmin && blk.orderId}
                                                                            onChange={(e) => handleMedBlockChange(bIdx, 'dose', e.target.value)}
                                                                        />
                                                                    </td>
                                                                    <td className="dc-mar-subval-td">
                                                                        <input
                                                                            className="dc-cell-input"
                                                                            value={blk.doctorName || ''}
                                                                            disabled={!isDoctorOrAdmin && blk.orderId}
                                                                            onChange={(e) => handleMedBlockChange(bIdx, 'doctorName', e.target.value)}
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
</TabletSheetZoom>
                    )}
                </div>

                {/* =========================================================
                    SUB-MODAL 1: EDIT PROGRESS NOTE (PRESERVES AUDIT HISTORY)
                   ========================================================= */}
                {editingProgress && (
                    <div className="ipdc-submodal-overlay" onClick={() => setEditingProgress(null)}>
                        <div className="ipdc-submodal" onClick={(e) => e.stopPropagation()}>
                            <div className="ipdc-submodal-hdr">
                                <h4>Edit Clinical Progress Note</h4>
                                <button type="button" onClick={() => setEditingProgress(null)}><FiX /></button>
                            </div>
                            <form onSubmit={handleSaveProgressEdit} className="ipdc-form">
                                <div className="ipdc-form-row-2">
                                    <div className="ipdc-field">
                                        <label>Date &amp; Time</label>
                                        <input
                                            type="datetime-local"
                                            value={editingProgress.recordedAt}
                                            onChange={(e) => setEditingProgress(p => ({ ...p, recordedAt: e.target.value }))}
                                        />
                                    </div>
                                    <div className="ipdc-field">
                                        <label>Sheet No.</label>
                                        <input
                                            type="text"
                                            value={editingProgress.sheetNo}
                                            onChange={(e) => setEditingProgress(p => ({ ...p, sheetNo: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="ipdc-field">
                                    <label>Updated Clinical Observation *</label>
                                    <textarea
                                        rows={4}
                                        value={editingProgress.note}
                                        onChange={(e) => setEditingProgress(p => ({ ...p, note: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="ipdc-field">
                                    <label>Reason for Edit (Audit Trail)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Clarified dosage / added vital review detail"
                                        value={editingProgress.editReason}
                                        onChange={(e) => setEditingProgress(p => ({ ...p, editReason: e.target.value }))}
                                    />
                                </div>
                                <div className="ipdc-submodal-actions">
                                    <button type="button" className="ipdc-btn-outline" onClick={() => setEditingProgress(null)}>Cancel</button>
                                    <button type="submit" className="ipdc-btn-primary" disabled={savingProgress}>
                                        {savingProgress ? 'Updating…' : 'Save Update (Keep History)'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    SUB-MODAL 2: MAR GRID CELL ADMINISTRATION / CORRECTION
                   ========================================================= */}
                {marCellModal && (
                    <div className="ipdc-submodal-overlay" onClick={() => setMarCellModal(null)}>
                        <div className="ipdc-submodal" onClick={(e) => e.stopPropagation()}>
                            <div className="ipdc-submodal-hdr">
                                <h4>
                                    {marCellModal.isCorrection
                                        ? 'Authorized Correction — Medication Administration'
                                        : 'Record Medication Administration'}
                                </h4>
                                <button type="button" onClick={() => setMarCellModal(null)}><FiX /></button>
                            </div>

                            <div className="mar-rx-banner">
                                <div><strong>Medicine:</strong> {marCellModal.order.medicineName}</div>
                                <div>
                                    <strong>Prescribed:</strong> {marCellModal.order.dosageValue ?? ''} {marCellModal.order.dosageUnit || ''} ({marCellModal.order.route || 'Oral'}) • <strong>Slot:</strong> {formatDateDisplay(marCellModal.dateKey)} @ {marCellModal.slot}
                                </div>
                            </div>

                            {!canNurseAdminister ? (
                                <div className="mar-readonly-alert">
                                    <p>Only authorized nursing staff can confirm or amend medication administration records.</p>
                                    {marCellModal.existingMar && (
                                        <div className="mar-existing-meta">
                                            <strong>Current Status:</strong> {formatMarCellStatus(marCellModal.existingMar).label}<br />
                                            {marCellModal.existingMar.administeredByName && <><strong>Given By:</strong> {marCellModal.existingMar.administeredByName}<br /></>}
                                            {marCellModal.existingMar.actualDose && <><strong>Actual Dose:</strong> {marCellModal.existingMar.actualDose}<br /></>}
                                            {marCellModal.existingMar.reason && <><strong>Reason:</strong> {marCellModal.existingMar.reason}</>}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <form onSubmit={handleSubmitMarCell} className="ipdc-form">
                                    <div className="ipdc-form-row-2">
                                        <div className="ipdc-field">
                                            <label>Administration Status *</label>
                                            <select
                                                value={marCellModal.status}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, status: e.target.value }))}
                                            >
                                                <option value="ADMINISTERED">Given (Administered)</option>
                                                <option value="SCHEDULED">Pending (Scheduled)</option>
                                                <option value="NOT_GIVEN">Not Given (Missed)</option>
                                                <option value="REFUSED">Refused by Patient</option>
                                                <option value="HELD">Held Clinically</option>
                                            </select>
                                        </div>
                                        <div className="ipdc-field">
                                            <label>Actual Date &amp; Time</label>
                                            <input
                                                type="datetime-local"
                                                value={marCellModal.administeredTime}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, administeredTime: e.target.value }))}
                                            />
                                        </div>
                                    </div>

                                    <div className="ipdc-form-row-3">
                                        <div className="ipdc-field">
                                            <label>Actual Dose Value</label>
                                            <input
                                                type="number"
                                                step="any"
                                                value={marCellModal.actualDoseValue}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, actualDoseValue: e.target.value }))}
                                            />
                                        </div>
                                        <div className="ipdc-field">
                                            <label>Dose Unit</label>
                                            <input
                                                type="text"
                                                value={marCellModal.actualDoseUnit}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, actualDoseUnit: e.target.value }))}
                                            />
                                        </div>
                                        <div className="ipdc-field">
                                            <label>Route</label>
                                            <select
                                                value={marCellModal.route}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, route: e.target.value }))}
                                            >
                                                {ROUTES_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {['HELD', 'REFUSED', 'NOT_GIVEN', 'MISSED'].includes(marCellModal.status) && (
                                        <div className="ipdc-field">
                                            <label>Omission / Refusal / Hold Reason *</label>
                                            <input
                                                type="text"
                                                placeholder="Mandatory clinical reason for omission/refusal/hold"
                                                value={marCellModal.reason}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, reason: e.target.value }))}
                                                required
                                            />
                                        </div>
                                    )}

                                    <div className="ipdc-field">
                                        <label>Nursing Remarks</label>
                                        <input
                                            type="text"
                                            placeholder="Optional site, patient tolerance, or clinical remarks"
                                            value={marCellModal.notes}
                                            onChange={(e) => setMarCellModal(p => ({ ...p, notes: e.target.value }))}
                                        />
                                    </div>

                                    {marCellModal.isCorrection && (
                                        <div className="ipdc-field">
                                            <label>Correction Reason (Mandatory Audit Log) *</label>
                                            <input
                                                type="text"
                                                placeholder="Explain why this completed administration record is being corrected"
                                                value={marCellModal.correctionReason}
                                                onChange={(e) => setMarCellModal(p => ({ ...p, correctionReason: e.target.value }))}
                                                required
                                            />
                                        </div>
                                    )}

                                    {marCellModal.existingMar?.editHistory?.length > 0 && (
                                        <div className="mar-audit-toggle">
                                            <button type="button" className="ipdc-link-btn" onClick={() => setExpandedMarAudit(v => !v)}>
                                                <FiClock size={12} /> {expandedMarAudit ? 'Hide' : 'View'} Correction History ({marCellModal.existingMar.editHistory.length})
                                            </button>
                                            {expandedMarAudit && (
                                                <div className="audit-box">
                                                    {marCellModal.existingMar.editHistory.map((h, i) => (
                                                        <div key={h._id || i} className="audit-item">
                                                            <div className="audit-meta">
                                                                <strong>{h.editedByName}</strong> ({new Date(h.editedAt).toLocaleString('en-IN')}) — Reason: <em>{h.correctionReason}</em>
                                                            </div>
                                                            <div className="audit-prev">
                                                                Previous: {h.previousStatus}{h.previousActualDose ? `, Dose: ${h.previousActualDose}` : ''}{h.previousReason ? `, Reason: ${h.previousReason}` : ''}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="ipdc-submodal-actions">
                                        <button type="button" className="ipdc-btn-outline" onClick={() => setMarCellModal(null)}>Cancel</button>
                                        <button type="submit" className="ipdc-btn-primary" disabled={savingMarCell}>
                                            {savingMarCell ? 'Saving…' : (marCellModal.isCorrection ? 'Confirm Authorized Correction' : 'Confirm Administration')}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}

                {/* =========================================================
                    SUB-MODAL 3: STAT DOSE ADMINISTER / CORRECT / VERIFY
                   ========================================================= */}
                {statActionModal && (
                    <div className="ipdc-submodal-overlay" onClick={() => setStatActionModal(null)}>
                        <div className="ipdc-submodal" onClick={(e) => e.stopPropagation()}>
                            <div className="ipdc-submodal-hdr">
                                <h4>STAT Dose — {statActionModal.entry.drugName}</h4>
                                <button type="button" onClick={() => setStatActionModal(null)}><FiX /></button>
                            </div>
                            <form onSubmit={handleSubmitStatAction} className="ipdc-form">
                                {statActionModal.mode === 'edit' && isDoctorOrAdmin && (
                                    <div className="ipdc-grid-2">
                                        <div className="ipdc-field">
                                            <label>Drug Name</label>
                                            <input type="text" value={statActionModal.form.drugName} onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, drugName: e.target.value } }))} />
                                        </div>
                                        <div className="ipdc-field">
                                            <label>Dose</label>
                                            <input type="text" value={statActionModal.form.dose} onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, dose: e.target.value } }))} />
                                        </div>
                                    </div>
                                )}
                                {(statActionModal.mode === 'administer' || statActionModal.mode === 'correct') && (
                                    <>
                                        <div className="ipdc-form-row-2">
                                            <div className="ipdc-field">
                                                <label>Status *</label>
                                                <select
                                                    value={statActionModal.form.status}
                                                    onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, status: e.target.value } }))}
                                                >
                                                    <option value="ADMINISTERED">Given</option>
                                                    <option value="NOT_GIVEN">Not Given</option>
                                                    <option value="REFUSED">Refused</option>
                                                    <option value="HELD">Held</option>
                                                </select>
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Given By</label>
                                                <input
                                                    type="text"
                                                    value={statActionModal.form.givenByName}
                                                    onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, givenByName: e.target.value } }))}
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="ipdc-form-row-2">
                                    <div className="ipdc-field">
                                        <label>Checked By</label>
                                        <input
                                            type="text"
                                            placeholder="Verifying nurse/clinician"
                                            value={statActionModal.form.checkedByName}
                                            onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, checkedByName: e.target.value } }))}
                                        />
                                    </div>
                                    <div className="ipdc-field">
                                        <label>Remarks</label>
                                        <input
                                            type="text"
                                            value={statActionModal.form.remarks}
                                            onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, remarks: e.target.value } }))}
                                        />
                                    </div>
                                </div>
                                {statActionModal.mode === 'correct' && (
                                    <div className="ipdc-field">
                                        <label>Correction Reason *</label>
                                        <input
                                            type="text"
                                            required
                                            value={statActionModal.form.editReason}
                                            onChange={(e) => setStatActionModal(p => ({ ...p, form: { ...p.form, editReason: e.target.value } }))}
                                        />
                                    </div>
                                )}
                                <div className="ipdc-submodal-actions">
                                    <button type="button" className="ipdc-btn-outline" onClick={() => setStatActionModal(null)}>Cancel</button>
                                    <button type="submit" className="ipdc-btn-primary" disabled={savingStat}>
                                        {savingStat ? 'Saving…' : 'Save STAT Update'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* =========================================================
                    SUB-MODAL 4: IV FLUID NURSING ADMINISTRATION
                   ========================================================= */}
                {ivActionModal && (
                    <div className="ipdc-submodal-overlay" onClick={() => setIvActionModal(null)}>
                        <div className="ipdc-submodal" onClick={(e) => e.stopPropagation()}>
                            <div className="ipdc-submodal-hdr">
                                <h4>IV Fluid — {ivActionModal.entry.fluidName}</h4>
                                <button type="button" onClick={() => setIvActionModal(null)}><FiX /></button>
                            </div>
                            <form onSubmit={handleSubmitIvAction} className="ipdc-form">
                                <div className="ipdc-form-row-2">
                                    <div className="ipdc-field">
                                        <label>Status</label>
                                        <select value={ivActionModal.form.status} onChange={(e) => setIvActionModal(p => ({ ...p, form: { ...p.form, status: e.target.value } }))}>
                                            <option value="RUNNING">Running</option>
                                            <option value="COMPLETED">Completed</option>
                                            <option value="HELD">Held</option>
                                            <option value="NOT_GIVEN">Not Given</option>
                                        </select>
                                    </div>
                                    <div className="ipdc-field">
                                        <label>Administered By</label>
                                        <input type="text" value={ivActionModal.form.adminByName} onChange={(e) => setIvActionModal(p => ({ ...p, form: { ...p.form, adminByName: e.target.value } }))} />
                                    </div>
                                </div>
                                <div className="ipdc-form-row-2">
                                    <div className="ipdc-field">
                                        <label>Time Start</label>
                                        <input type="text" value={ivActionModal.form.timeStart} onChange={(e) => setIvActionModal(p => ({ ...p, form: { ...p.form, timeStart: e.target.value } }))} />
                                    </div>
                                    <div className="ipdc-field">
                                        <label>Infusion Time (hrs.)</label>
                                        <input type="text" value={ivActionModal.form.infusionTimeHrs} onChange={(e) => setIvActionModal(p => ({ ...p, form: { ...p.form, infusionTimeHrs: e.target.value } }))} />
                                    </div>
                                </div>
                                <div className="ipdc-field">
                                    <label>Remarks</label>
                                    <input type="text" value={ivActionModal.form.remarks} onChange={(e) => setIvActionModal(p => ({ ...p, form: { ...p.form, remarks: e.target.value } }))} />
                                </div>
                                {(ivActionModal.mode === 'edit' || ['COMPLETED', 'HELD', 'NOT_GIVEN'].includes(ivActionModal.entry.status)) && (
                                    <div className="ipdc-field">
                                        <label>Correction Reason (Mandatory Audit) *</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Explain why this finalized IV fluid entry is being amended..."
                                            value={ivActionModal.form.editReason || ''}
                                            onChange={(e) => setIvActionModal(p => ({ ...p, form: { ...p.form, editReason: e.target.value } }))}
                                        />
                                    </div>
                                )}
                                <div className="ipdc-submodal-actions">
                                    <button type="button" className="ipdc-btn-outline" onClick={() => setIvActionModal(null)}>Cancel</button>
                                    <button type="submit" className="ipdc-btn-primary" disabled={savingIv}>
                                        {savingIv ? 'Saving…' : 'Save IV Fluid Update'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* AI Voice Scribe Modal */}
                <ClinicalVoiceScribeModal
                    isOpen={isScribeModalOpen}
                    onClose={() => setIsScribeModalOpen(false)}
                    onApproveAndInsert={handleApproveVoiceScribe}
                    patientName={ptDetails.name}
                    uhid={ptDetails.uhid}
                    ipdNumber={ptDetails.ipdNumber}
                />
            </div>
        </div>,
        document.body
    );
};

export default IPDClinicalChartsModal;
