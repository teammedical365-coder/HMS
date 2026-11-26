import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ipdClinicalAPI, admissionAPI, doctorAPI, nursingNoteAPI, pharmacyAPI, bedAPI } from '../../utils/api';
import socket from '../../utils/socket';
import { useAuth } from '../../store/hooks';
import {
    FiActivity,
    FiAlertCircle,
    FiAlertTriangle,
    FiCheck,
    FiCheckCircle,
    FiClock,
    FiDroplet,
    FiEye,
    FiFileText,
    FiHelpCircle,
    FiLayers,
    FiMessageSquare,
    FiPlus,
    FiPrinter,
    FiRefreshCw,
    FiSave,
    FiSend,
    FiTrash2,
    FiMapPin,
    FiUserCheck,
    FiX
} from 'react-icons/fi';
import './DoctorIPDOrdersPanel.css';
import CustomSelect from '../common/CustomSelect';
import TPRChartModal from './TPRChartModal';
import InpatientClinicalNotesModal from './InpatientClinicalNotesModal';
import IPDClinicalChartsModal from './IPDClinicalChartsModal';
import ICUChartModal from './ICUChartModal';

const COMMON_UNITS = [
    'mg', 'g', 'mcg', 'ml', 'tablet', 'capsule', 'vial', 'ampoule', 'drop', 'puff', 'patch', 'other'
];

const COMMON_ROUTES = [
    'Oral', 'IV', 'IM', 'SC', 'Topical', 'Inhalation', 'Sublingual', 'Rectal', 'Other'
];

const COMMON_FREQUENCIES = [
    'Once Daily',
    'BD',
    'TDS',
    'QID',
    'SOS',
    'STAT',
    'Every 4 hours',
    'Every 6 hours',
    'Every 8 hours',
    'Every 12 hours'
];

const getDefaultScheduledTimes = (freq) => {
    const f = String(freq || 'OD').toUpperCase().trim();
    if (f === 'OD' || f === 'ONCE DAILY' || f === 'DAILY' || f === '1 TIME DAILY') return ['10:00 AM'];
    if (f === 'BD' || f === 'BID' || f === 'TWICE DAILY' || f === '2 TIMES DAILY') return ['10:00 AM', '08:00 PM'];
    if (f === 'TDS' || f === 'TID' || f === 'THREE TIMES DAILY' || f === '3 TIMES DAILY') return ['08:00 AM', '02:00 PM', '08:00 PM'];
    if (f === 'QID' || f === 'FOUR TIMES DAILY' || f === '4 TIMES DAILY') return ['06:00 AM', '12:00 PM', '06:00 PM', '10:00 PM'];
    if (f === 'STAT' || f === 'ONCE' || f === 'IMMEDIATE') {
        const now = new Date();
        return [now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })];
    }
    if (f === 'SOS' || f === 'PRN') return ['10:00 AM'];
    if (f.includes('4 HOUR') || f.includes('EVERY 4')) return ['06:00 AM', '10:00 AM', '02:00 PM', '06:00 PM', '10:00 PM', '02:00 AM'];
    if (f.includes('6 HOUR') || f.includes('EVERY 6')) return ['06:00 AM', '12:00 PM', '06:00 PM', '12:00 AM'];
    if (f.includes('8 HOUR') || f.includes('EVERY 8')) return ['08:00 AM', '04:00 PM', '12:00 AM'];
    if (f.includes('12 HOUR') || f.includes('EVERY 12')) return ['10:00 AM', '10:00 PM'];
    return ['10:00 AM'];
};

const getFrequencyDisplay = (freq, scheduledTimes) => {
    if (!freq) {
        if (scheduledTimes && scheduledTimes.length > 0) {
            return {
                title: `${scheduledTimes.length} Times`,
                count: `${scheduledTimes.length} times a day`
            };
        }
        return { title: '—', count: '' };
    }

    const norm = String(freq).trim().toUpperCase();
    if (norm === 'BD' || norm === 'BID' || norm === 'TWICE DAILY' || norm.includes('12 HOUR')) {
        return { title: 'BD', count: '2 times a day' };
    }
    if (norm === 'TDS' || norm === 'TID' || norm === 'THREE TIMES DAILY' || norm.includes('8 HOUR')) {
        return { title: 'TDS', count: '3 times a day' };
    }
    if (norm === 'QID' || norm === 'FOUR TIMES DAILY' || norm.includes('6 HOUR')) {
        return { title: 'QID', count: '4 times a day' };
    }
    if (norm === 'ONCE DAILY' || norm === 'OD' || norm === 'DAILY') {
        return { title: 'OD', count: '1 time a day' };
    }
    if (norm.includes('4 HOUR')) {
        return { title: 'Q4H', count: '6 times a day' };
    }
    if (norm === 'SOS' || norm === 'PRN') {
        return { title: 'SOS', count: 'As needed' };
    }
    if (norm === 'STAT' || norm === 'ONCE' || norm === 'IMMEDIATE') {
        return { title: 'STAT', count: '1 time (Immediate)' };
    }

    if (scheduledTimes && scheduledTimes.length > 0) {
        return { title: freq, count: `${scheduledTimes.length} times a day` };
    }

    return { title: freq, count: '' };
};

const ADMISSION_REASONS = [
    'Observation & Monitoring',
    'Post-Operative Recovery',
    'Intensive Care (ICU)',
    'IV Antibiotic / Fluid Therapy',
    'Acute Pain Management',
    'Unstable Vital Signs',
    'Planned Surgical Procedure',
    'Diagnostic Workup / Biopsy',
    'Severe Infection / Sepsis',
    'Cardiac Monitoring',
    'Other Clinical Indication'
];

const DISCHARGE_CONDITIONS = [
    'STABLE',
    'IMPROVED',
    'RECOVERED',
    'CRITICAL',
    'TRANSFERRED',
    'LAMA',
    'EXPIRED'
];

const createEmptyMedRow = () => ({
    medicineName: '',
    inventoryItemId: null,
    dosageValue: '',
    dosageUnit: 'mg',
    route: 'Oral',
    frequency: 'BD',
    scheduledTimes: ['10:00 AM', '08:00 PM'],
    startDate: new Date().toISOString().split('T')[0],
    duration: '3 days',
    instructions: 'After food'
});

const createEmptyDischargeMedRow = () => ({
    medicineName: '',
    dosage: '',
    route: 'Oral',
    frequency: 'BD',
    duration: '5 days',
    instructions: 'After meals'
});

const DoctorIPDOrdersPanel = ({
    admissionId = null,
    admission: propAdmission = null,
    patientId: propPatientId = null,
    patient: propPatient = {},
    appointment = null,
    currentUser = null,
    onOrderCreated = null,
    defaultTab = 'overview',
    hideHeaderBanner = false
}) => {
    const { user: authUser } = useAuth();
    const activeDoctor = currentUser || authUser;
    const hospitalId = activeDoctor?.hospitalId;

    const patientId = propPatientId || propAdmission?.patientId?._id || propAdmission?.patientId || propPatient?._id || null;
    const patient = propPatient || propAdmission?.patientId || {};

    // Active sub-tab: 'overview', 'treatment_chart', 'tpr_vitals', 'icu_chart', 'progress_notes', 'clinical_notes', 'drug_chart', 'mar', 'nursing_notes', 'communication', 'investigations', 'discharge'
    const [activeTab, setActiveTab] = useState(defaultTab || 'overview');

    // Active admission state
    const [activeAdmission, setActiveAdmission] = useState(propAdmission || null);
    const [loadingAdmission, setLoadingAdmission] = useState(!propAdmission);
    const [tprModalOpen, setTprModalOpen] = useState(false);
    const [clinicalNotesModalOpen, setClinicalNotesModalOpen] = useState(false);
    const [clinicalChartsModal, setClinicalChartsModal] = useState({ open: false, tab: 'progress_notes' });
    const [icuChartModalOpen, setIcuChartModalOpen] = useState(false);

    // ── Vitals & TPR State ──
    const [vitalsList, setVitalsList] = useState([]);
    const [loadingVitals, setLoadingVitals] = useState(false);

    // ── Progress Notes State ──
    const toLocalDateTimeInput = (dt = new Date()) => {
        const d = dt ? new Date(dt) : new Date();
        if (isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const [progressNotes, setProgressNotes] = useState([]);
    const [loadingProgressNotes, setLoadingProgressNotes] = useState(false);
    const [newProgressNote, setNewProgressNote] = useState(() => ({
        note: '',
        sheetNo: '1',
        recordedAt: toLocalDateTimeInput()
    }));
    const [savingProgressNote, setSavingProgressNote] = useState(false);

    // ── Drug Chart State ──
    const [drugChartData, setDrugChartData] = useState(null);
    const [loadingDrugChart, setLoadingDrugChart] = useState(false);

    // ── Clinical Notes State ──
    const [clinicalNotesData, setClinicalNotesData] = useState(null);
    const [loadingClinicalNotes, setLoadingClinicalNotes] = useState(false);

    // ── MAR State ──
    const [marList, setMarList] = useState([]);
    const [loadingMar, setLoadingMar] = useState(false);

    // ICU patient check
    const isICUPatient = useMemo(() => {
        if (!activeAdmission) return false;
        const w = (activeAdmission.ward || activeAdmission.bedId?.ward || '').toLowerCase();
        const b = (activeAdmission.bedNumber || activeAdmission.bedId?.bedNumber || '').toLowerCase();
        return Boolean(
            activeAdmission.isICU ||
            w.includes('icu') || w.includes('ccu') || w.includes('nicu') || w.includes('picu') ||
            b.includes('icu') || b.includes('ccu') || b.includes('nicu') || b.includes('picu')
        );
    }, [activeAdmission]);

    // Hospitalize Modal State
    const [hospitalizeModalOpen, setHospitalizeModalOpen] = useState(false);
    const [availableBeds, setAvailableBeds] = useState([]);
    const [loadingBeds, setLoadingBeds] = useState(false);
    const [hospitalizeSaving, setHospitalizingSaving] = useState(false);
    const [hospitalizeForm, setHospitalizeForm] = useState({
        ward: '',
        bedId: '',
        admissionDate: new Date().toISOString().split('T')[0],
        admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        notes: ''
    });

    // Pharmacy Inventory Catalog
    const [pharmacyMedicines, setPharmacyMedicines] = useState([]);
    const [loadingPharmacy, setLoadingPharmacy] = useState(false);

    // Form fields for New Clinical Order
    const [admissionReason, setAdmissionReason] = useState('Observation & Monitoring');
    const [customReason, setCustomReason] = useState('');
    const [diagnosis, setDiagnosis] = useState(
        appointment?.diagnosis || appointment?.department || ''
    );
    const [clinicalNotes, setClinicalNotes] = useState('');
    const [investigationNotes, setInvestigationNotes] = useState('');
    const [procedureNotes, setProcedureNotes] = useState('');
    const [anesthesiaNotes, setAnesthesiaNotes] = useState('');
    const [medicationRows, setMedicationRows] = useState([createEmptyMedRow()]);

    // Existing orders state
    const [existingOrders, setExistingOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Cancel modal state
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [cancelling, setCancelling] = useState(false);

    // ── Clarifications Inbox State ──
    const [clarifications, setClarifications] = useState([]);
    const [loadingClarifications, setLoadingClarifications] = useState(false);
    const [activeClarificationId, setActiveClarificationId] = useState(null);
    const [doctorResponseText, setDoctorResponseText] = useState('');
    const [submittingResponse, setSubmittingResponse] = useState(false);

    // ── Nursing Notes State ──
    const [nursingNotes, setNursingNotes] = useState([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [notesFilterCategory, setNotesFilterCategory] = useState('ALL');
    const [notesFilterShift, setNotesFilterShift] = useState('ALL');
    const [notesFilterPriority, setNotesFilterPriority] = useState('ALL');

    // ── Discharge Summary State ──
    const [dischargeSummary, setDischargeSummary] = useState({
        diagnosis: appointment?.diagnosis || '',
        admissionReason: '',
        hospitalCourse: '',
        proceduresSummary: '',
        keyInvestigationsSummary: '',
        treatmentSummary: '',
        conditionAtDischarge: 'STABLE',
        dischargeMedications: [createEmptyDischargeMedRow()],
        followUpInstructions: '',
        returnPrecautions: 'Seek emergency care immediately if experiencing high fever, chest pain, shortness of breath, severe pain, or bleeding.',
        followUpDate: '',
        status: 'DRAFT'
    });
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [savingSummary, setSavingSummary] = useState(false);
    const [summaryDoctorSigned, setSummaryDoctorSigned] = useState(false);

    // Fetch active admission for this specific patient
    const fetchAdmission = useCallback(async () => {
        if (propAdmission && propAdmission._id) {
            setActiveAdmission(propAdmission);
            setLoadingAdmission(false);
            return;
        }

        if (admissionId) {
            setLoadingAdmission(true);
            try {
                let found = null;
                try {
                    const singleRes = await admissionAPI.getAdmissionById(admissionId);
                    found = singleRes.admission || singleRes.data || singleRes;
                } catch (singleErr) {
                    console.warn('Single admission fetch fallback:', singleErr);
                }
                if (!found) {
                    const res = await admissionAPI.getActiveAdmissions();
                    const list = res.admissions || res.data || [];
                    found = list.find(a => String(a._id) === String(admissionId));
                }
                if (found) {
                    setActiveAdmission(found);
                }
            } catch (err) {
                console.warn('Could not fetch admission by id', err);
            } finally {
                setLoadingAdmission(false);
            }
            return;
        }

        if (!patientId) return;
        setLoadingAdmission(true);
        try {
            let list = [];
            try {
                const ptRes = await admissionAPI.getPatientAdmissions(patientId);
                list = ptRes.admissions || ptRes.data || [];
            } catch (ptErr) {
                const res = await admissionAPI.getActiveAdmissions();
                list = res.admissions || res.data || [];
            }
            const active = list.find(a => {
                const p = a.patientId?._id || a.patientId;
                const matchesPatient = String(p) === String(patientId);
                const isActive = ['ADMITTED', 'Admitted', 'admitted'].includes(a.status);
                return matchesPatient && isActive;
            });
            setActiveAdmission(active || null);
        } catch (err) {
            console.warn('Could not fetch patient admission status', err);
            setActiveAdmission(null);
        } finally {
            setLoadingAdmission(false);
        }
    }, [admissionId, propAdmission, patientId]);

    // ── Additional Clinical Stream Fetchers ──
    const fetchVitals = useCallback(async () => {
        const admId = activeAdmission?._id || admissionId;
        if (!admId) return;
        setLoadingVitals(true);
        try {
            const res = await ipdClinicalAPI.getVitalsHistory(admId);
            setVitalsList(Array.isArray(res?.vitals) ? res.vitals : (Array.isArray(res?.data) ? res.data : []));
        } catch (err) {
            console.warn('Failed to fetch vitals:', err);
        } finally {
            setLoadingVitals(false);
        }
    }, [activeAdmission?._id, admissionId]);

    const fetchProgressNotes = useCallback(async () => {
        const admId = activeAdmission?._id || admissionId;
        if (!admId) return;
        setLoadingProgressNotes(true);
        try {
            const res = await ipdClinicalAPI.getProgressNotes(admId);
            setProgressNotes(Array.isArray(res?.notes) ? res.notes : (Array.isArray(res?.data) ? res.data : []));
        } catch (err) {
            console.warn('Failed to fetch progress notes:', err);
        } finally {
            setLoadingProgressNotes(false);
        }
    }, [activeAdmission?._id, admissionId]);

    const fetchDrugChart = useCallback(async () => {
        const admId = activeAdmission?._id || admissionId;
        if (!admId) return;
        setLoadingDrugChart(true);
        try {
            const res = await ipdClinicalAPI.getDrugChart(admId);
            setDrugChartData(res?.drugChart || res?.data || null);
        } catch (err) {
            console.warn('Failed to fetch drug chart:', err);
        } finally {
            setLoadingDrugChart(false);
        }
    }, [activeAdmission?._id, admissionId]);

    const fetchClinicalNotes = useCallback(async () => {
        const admId = activeAdmission?._id || admissionId;
        if (!admId) return;
        setLoadingClinicalNotes(true);
        try {
            const res = await ipdClinicalAPI.getInpatientClinicalNotes(admId);
            setClinicalNotesData(res?.clinicalNotes || res?.data || null);
        } catch (err) {
            console.warn('Failed to fetch clinical notes:', err);
        } finally {
            setLoadingClinicalNotes(false);
        }
    }, [activeAdmission?._id, admissionId]);

    const fetchMAR = useCallback(async () => {
        const admId = activeAdmission?._id || admissionId;
        if (!admId) return;
        setLoadingMar(true);
        try {
            const res = await ipdClinicalAPI.getMARRecords(admId);
            setMarList(Array.isArray(res?.marRecords) ? res.marRecords : (Array.isArray(res?.data) ? res.data : []));
        } catch (err) {
            console.warn('Failed to fetch MAR records:', err);
        } finally {
            setLoadingMar(false);
        }
    }, [activeAdmission?._id, admissionId]);

    // Handle adding a new progress note
    const handleAddProgressNote = async (e) => {
        if (e) e.preventDefault();
        const admId = activeAdmission?._id || admissionId;
        if (!admId) {
            setErrorMsg('Active admission required to add progress note');
            return;
        }
        if (!newProgressNote.note.trim()) {
            setErrorMsg('Please enter a clinical progress observation');
            return;
        }

        setSavingProgressNote(true);
        setErrorMsg('');
        try {
            const res = await ipdClinicalAPI.addProgressNote(admId, {
                note: newProgressNote.note.trim(),
                sheetNo: newProgressNote.sheetNo || '1',
                recordedAt: newProgressNote.recordedAt || new Date().toISOString()
            });
            if (res && res.success) {
                setSuccessMsg('Clinical Progress Note saved successfully!');
                setNewProgressNote({
                    note: '',
                    sheetNo: newProgressNote.sheetNo || '1',
                    recordedAt: toLocalDateTimeInput()
                });
                fetchProgressNotes();
                setTimeout(() => setSuccessMsg(''), 4000);
            } else {
                setErrorMsg(res?.message || 'Failed to save progress note');
            }
        } catch (err) {
            console.error('Error saving progress note:', err);
            setErrorMsg(err.response?.data?.message || err.message || 'Error saving progress note');
        } finally {
            setSavingProgressNote(false);
        }
    };

    // Open Hospitalize Modal & Fetch Available Beds
    const handleOpenHospitalizeModal = async () => {
        setHospitalizeModalOpen(true);
        setLoadingBeds(true);
        setErrorMsg('');
        setHospitalizeForm({
            ward: '',
            bedId: '',
            admissionDate: new Date().toISOString().split('T')[0],
            admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
            notes: diagnosis || appointment?.diagnosis || appointment?.department || 'Doctor Inpatient Admission'
        });
        try {
            const res = await bedAPI.getBeds({ status: 'AVAILABLE' });
            const beds = res.beds || res.data || [];
            setAvailableBeds(beds);
            if (beds.length > 0) {
                const firstWard = beds[0].ward;
                setHospitalizeForm(prev => ({
                    ...prev,
                    ward: firstWard,
                    bedId: beds[0]._id
                }));
            }
        } catch (err) {
            console.error('Failed to fetch available beds:', err);
        } finally {
            setLoadingBeds(false);
        }
    };

    // Submit Hospitalization
    const handleHospitalizePatient = async (e) => {
        if (e) e.preventDefault();
        if (!hospitalizeForm.ward) {
            setErrorMsg('Please select a Ward for hospitalization.');
            return;
        }
        if (!hospitalizeForm.bedId) {
            setErrorMsg('Please select an available Bed for hospitalization.');
            return;
        }
        setHospitalizingSaving(true);
        setErrorMsg('');
        try {
            const res = await admissionAPI.createAdmission({
                patientId: patientId,
                appointmentId: appointment?._id || undefined,
                doctorId: activeDoctor?._id || activeDoctor?.userId,
                ward: hospitalizeForm.ward,
                bedId: hospitalizeForm.bedId,
                admissionDate: hospitalizeForm.admissionDate,
                admissionTime: hospitalizeForm.admissionTime,
                notes: hospitalizeForm.notes
            });
            if (res.success || res.admission) {
                setSuccessMsg(`🎉 Patient hospitalized successfully to ${hospitalizeForm.ward}! Bed allocated.`);
                setHospitalizeModalOpen(false);
                fetchAdmission();
                fetchOrders();
            } else {
                setErrorMsg(res.message || 'Failed to hospitalize patient.');
            }
        } catch (err) {
            console.error('Hospitalize error:', err);
            setErrorMsg(err.response?.data?.message || err.message || 'Failed to hospitalize patient.');
        } finally {
            setHospitalizingSaving(false);
        }
    };

    // Fetch orders
    const fetchOrders = useCallback(async () => {
        if (!patientId) return;
        setLoadingOrders(true);
        try {
            const res = await ipdClinicalAPI.getPatientOrders(patientId);
            if (res.success) {
                setExistingOrders(res.data || []);
            } else {
                setExistingOrders([]);
            }
        } catch (err) {
            console.warn('Could not fetch existing IPD orders', err);
            setExistingOrders([]);
        } finally {
            setLoadingOrders(false);
        }
    }, [patientId]);

    // Fetch clarifications
    const fetchClarifications = useCallback(async () => {
        if (!activeAdmission?._id) return;
        setLoadingClarifications(true);
        try {
            const res = await ipdClinicalAPI.getClarificationsInbox({
                admissionId: activeAdmission._id,
                status: 'ALL'
            });
            if (res.success) {
                setClarifications(res.clarifications || res.data || []);
            }
        } catch (err) {
            console.warn('Could not fetch clarifications', err);
        } finally {
            setLoadingClarifications(false);
        }
    }, [activeAdmission]);

    // Fetch nursing clinical notes
    const fetchNursingNotes = useCallback(async () => {
        if (!activeAdmission?._id) return;
        setLoadingNotes(true);
        try {
            const res = await nursingNoteAPI.getNotes(activeAdmission._id);
            if (res.success || res.notes) {
                setNursingNotes(res.notes || res.data || []);
            }
        } catch (err) {
            console.warn('Could not fetch nursing notes', err);
        } finally {
            setLoadingNotes(false);
        }
    }, [activeAdmission]);

    // Fetch structured discharge summary
    const fetchDischargeSummary = useCallback(async () => {
        if (!activeAdmission?._id) return;
        setLoadingSummary(true);
        try {
            const res = await ipdClinicalAPI.getDischargeSummary(activeAdmission._id);
            if (res.success && res.dischargeSummary) {
                const s = res.dischargeSummary;
                setDischargeSummary({
                    diagnosis: s.diagnosis || '',
                    admissionReason: s.admissionReason || '',
                    hospitalCourse: s.hospitalCourse || '',
                    proceduresSummary: s.proceduresSummary || '',
                    keyInvestigationsSummary: s.keyInvestigationsSummary || '',
                    treatmentSummary: s.treatmentSummary || '',
                    conditionAtDischarge: s.conditionAtDischarge || 'STABLE',
                    dischargeMedications: s.dischargeMedications?.length > 0
                        ? s.dischargeMedications
                        : [createEmptyDischargeMedRow()],
                    followUpInstructions: s.followUpInstructions || '',
                    returnPrecautions: s.returnPrecautions || '',
                    followUpDate: s.followUpDate ? s.followUpDate.split('T')[0] : '',
                    status: s.status || 'DRAFT'
                });
                setSummaryDoctorSigned(s.status === 'FINALIZED');
            }
        } catch (err) {
            console.warn('Could not fetch discharge summary', err);
        } finally {
            setLoadingSummary(false);
        }
    }, [activeAdmission]);

    // Fetch Pharmacy Inventory
    const fetchPharmacyInventory = useCallback(async () => {
        try {
            setLoadingPharmacy(true);
            const res = await pharmacyAPI.getInventory();
            const items = res?.data || res?.inventory || [];
            setPharmacyMedicines(items);
        } catch (err) {
            console.warn('Could not fetch pharmacy inventory for auto-complete', err);
        } finally {
            setLoadingPharmacy(false);
        }
    }, []);

    useEffect(() => {
        fetchAdmission();
        fetchOrders();
        fetchPharmacyInventory();
    }, [fetchAdmission, fetchOrders, fetchPharmacyInventory]);

    useEffect(() => {
        if (activeAdmission?._id) {
            fetchClarifications();
            fetchNursingNotes();
            fetchDischargeSummary();
            fetchVitals();
            fetchProgressNotes();
            fetchDrugChart();
            fetchClinicalNotes();
            fetchMAR();
        }
    }, [
        activeAdmission,
        fetchClarifications,
        fetchNursingNotes,
        fetchDischargeSummary,
        fetchVitals,
        fetchProgressNotes,
        fetchDrugChart,
        fetchClinicalNotes,
        fetchMAR
    ]);

    // Socket.IO real-time event listeners
    useEffect(() => {
        if (!socket) return;

        const handleOrderEvent = () => {
            fetchOrders();
            fetchClarifications();
            fetchNursingNotes();
            fetchAdmission();
            fetchVitals();
            fetchProgressNotes();
            fetchDrugChart();
            fetchMAR();
        };

        const events = [
            'inpatient_order_created',
            'inpatient_order_updated',
            'doctor_order_acknowledged',
            'order_clarification_requested',
            'order_clarification_resolved',
            'nursing_note_created',
            'discharge_summary_updated',
            'ipd:order_created',
            'ipd:mar_updated',
            'ipd:vitals_updated',
            'ipd:notes_updated',
            'ipd:progress_note_added',
            'ipd:clarification_answered'
        ];

        events.forEach(evt => socket.on(evt, handleOrderEvent));

        return () => {
            events.forEach(evt => socket.off(evt, handleOrderEvent));
        };
    }, [fetchOrders, fetchClarifications, fetchNursingNotes, fetchAdmission, fetchVitals, fetchProgressNotes, fetchDrugChart, fetchMAR]);

    // Medicine row management
    const handleMedRowChange = (index, field, value) => {
        setMedicationRows(prev => {
            const updated = [...prev];
            const row = { ...updated[index], [field]: value };
            if (field === 'frequency') {
                row.scheduledTimes = getDefaultScheduledTimes(value);
            }
            updated[index] = row;
            return updated;
        });
    };

    const handleSelectPharmacyMedicine = (index, medItem) => {
        if (!medItem) return;
        setMedicationRows(prev => {
            const updated = [...prev];
            const row = { ...updated[index] };
            row.medicineName = medItem.name;
            row.inventoryItemId = medItem._id;

            // Auto-extract strength if in name (e.g. "Paracetamol 500mg" or "Ceftriaxone 1g")
            const doseMatch = medItem.name.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|iu|tab|puff|drop)/i);
            if (doseMatch) {
                row.dosageValue = doseMatch[1];
                row.dosageUnit = doseMatch[2].toLowerCase();
            } else if (medItem.unit) {
                const u = medItem.unit.toLowerCase();
                row.dosageUnit = u.includes('tab') ? 'tablet' : (u.includes('inj') ? 'vial' : 'mg');
            }

            // Infer route
            const lowerName = medItem.name.toLowerCase();
            const lowerCat = (medItem.category || '').toLowerCase();
            if (lowerName.includes('inj') || lowerCat.includes('inject') || lowerName.includes('infusion')) {
                row.route = 'IV';
            } else if (lowerName.includes('tab') || lowerName.includes('cap') || lowerName.includes('syr') || lowerCat.includes('tablet')) {
                row.route = 'Oral';
            } else if (lowerName.includes('drop') || lowerName.includes('oint') || lowerName.includes('cream')) {
                row.route = 'Topical';
            }

            updated[index] = row;
            return updated;
        });
    };

    const handleTimeSlotChange = (medIdx, slotIdx, newTime) => {
        setMedicationRows(prev => {
            const updated = [...prev];
            const row = { ...updated[medIdx] };
            const times = [...(row.scheduledTimes || [])];
            times[slotIdx] = newTime;
            row.scheduledTimes = times;
            updated[medIdx] = row;
            return updated;
        });
    };

    const handleAddTimeSlot = (medIdx) => {
        setMedicationRows(prev => {
            const updated = [...prev];
            const row = { ...updated[medIdx] };
            const times = [...(row.scheduledTimes || [])];
            times.push('12:00 PM');
            row.scheduledTimes = times;
            updated[medIdx] = row;
            return updated;
        });
    };

    const handleRemoveTimeSlot = (medIdx, slotIdx) => {
        setMedicationRows(prev => {
            const updated = [...prev];
            const row = { ...updated[medIdx] };
            const times = (row.scheduledTimes || []).filter((_, i) => i !== slotIdx);
            row.scheduledTimes = times.length > 0 ? times : ['10:00 AM'];
            updated[medIdx] = row;
            return updated;
        });
    };

    const addMedRow = () => {
        setMedicationRows(prev => [...prev, createEmptyMedRow()]);
    };

    const removeMedRow = (index) => {
        if (medicationRows.length <= 1) {
            setMedicationRows([createEmptyMedRow()]);
            return;
        }
        setMedicationRows(prev => prev.filter((_, i) => i !== index));
    };

    // Calculate end date based on duration
    const computeEndDate = (startDateStr, durationStr) => {
        try {
            const start = new Date(startDateStr);
            const numDaysMatch = durationStr.match(/(\d+)/);
            const days = numDaysMatch ? parseInt(numDaysMatch[1], 10) : 3;
            const end = new Date(start);
            end.setDate(start.getDate() + days);
            return end;
        } catch {
            return undefined;
        }
    };

    // Form Submission for New Medication Orders
    const handleSubmitOrders = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        if (!activeAdmission?._id) {
            setErrorMsg('Patient is not hospitalized / admitted. Please click "Hospitalize / Admit Patient" first before placing IPD orders.');
            return;
        }

        if (!diagnosis.trim()) {
            setErrorMsg('Clinical Diagnosis is required.');
            return;
        }

        const validMeds = medicationRows.filter(m => m.medicineName.trim());
        if (validMeds.length === 0) {
            setErrorMsg('Please add at least one valid Medication Order.');
            return;
        }

        for (const [idx, med] of validMeds.entries()) {
            if (!med.medicineName.trim()) {
                setErrorMsg(`Row #${idx + 1}: Medicine Name is required.`);
                return;
            }
            if (med.dosageValue === '' || Number(med.dosageValue) <= 0) {
                setErrorMsg(`Row #${idx + 1}: Valid Dose (> 0) is required.`);
                return;
            }
            if (!med.dosageUnit) {
                setErrorMsg(`Row #${idx + 1}: Dose Unit is required.`);
                return;
            }
            if (!med.route) {
                setErrorMsg(`Row #${idx + 1}: Route is required.`);
                return;
            }
            if (!med.frequency) {
                setErrorMsg(`Row #${idx + 1}: Frequency is required.`);
                return;
            }
            if (!med.startDate) {
                setErrorMsg(`Row #${idx + 1}: Start Date is required.`);
                return;
            }
        }

        const resolvedReason = admissionReason === 'Other Clinical Indication'
            ? (customReason || 'Other')
            : admissionReason;

        let compiledNotes = clinicalNotes ? `Notes: ${clinicalNotes}` : '';
        if (investigationNotes.trim()) compiledNotes += `\n[Lab Advice]: ${investigationNotes.trim()}`;
        if (procedureNotes.trim()) compiledNotes += `\n[Procedure Advice]: ${procedureNotes.trim()}`;
        if (anesthesiaNotes.trim()) compiledNotes += `\n[Anesthesia Advice]: ${anesthesiaNotes.trim()}`;

        setSubmitting(true);
        try {
            for (const med of validMeds) {
                const startDate = new Date(med.startDate);
                const endDate = computeEndDate(med.startDate, med.duration || '3 days');

                const payload = {
                    patientId: patientId,
                    admissionId: activeAdmission?._id || null,
                    appointmentId: appointment?._id || null,
                    diagnosis: diagnosis.trim(),
                    admissionReason: resolvedReason,
                    clinicalNotes: compiledNotes.trim(),
                    medicineName: med.medicineName.trim(),
                    inventoryItemId: med.inventoryItemId || undefined,
                    dosage: {
                        value: Number(med.dosageValue),
                        unit: med.dosageUnit
                    },
                    route: med.route,
                    frequency: med.frequency,
                    scheduledTimes: med.scheduledTimes || [],
                    schedule: {
                        startDate: startDate,
                        endDate: endDate,
                        duration: med.duration || '3 days',
                        scheduledTimes: med.scheduledTimes || []
                    },
                    instructions: med.instructions || ''
                };

                const res = await ipdClinicalAPI.createOrder(payload);
                if (!res.success) {
                    throw new Error(res.message || 'Failed to submit clinical order');
                }
            }

            setSuccessMsg('✅ Inpatient clinical orders placed successfully!');
            setMedicationRows([createEmptyMedRow()]);
            setInvestigationNotes('');
            setProcedureNotes('');
            setAnesthesiaNotes('');
            setClinicalNotes('');

            fetchOrders();
            fetchAdmission();

            if (onOrderCreated) onOrderCreated();
        } catch (err) {
            console.error('Error creating IPD order:', err);
            setErrorMsg(err.response?.data?.message || err.message || 'Failed to create IPD order.');
        } finally {
            setSubmitting(false);
        }
    };

    // Cancel order handler
    const confirmCancelOrder = async () => {
        if (!orderToCancel) return;
        setCancelling(true);
        try {
            const res = await ipdClinicalAPI.updateOrder(orderToCancel._id, {
                status: 'CANCELLED'
            });
            if (res.success) {
                setSuccessMsg(`Order for ${orderToCancel.medicineName} has been cancelled.`);
                fetchOrders();
            } else {
                setErrorMsg(res.message || 'Failed to cancel order.');
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Error cancelling order.');
        } finally {
            setCancelling(false);
            setOrderToCancel(null);
        }
    };

    // ── Respond to Clarification ──
    const handleClarificationSubmit = async (orderId, clarId) => {
        if (!doctorResponseText.trim()) return;
        setSubmittingResponse(true);
        try {
            const res = await ipdClinicalAPI.respondClarification(activeAdmission._id, orderId, {
                clarificationId: clarId,
                responseText: doctorResponseText.trim()
            });
            if (res.success) {
                setSuccessMsg('✅ Clarification response sent to nurse station.');
                setDoctorResponseText('');
                setActiveClarificationId(null);
                fetchClarifications();
                fetchOrders();
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Error submitting response');
        } finally {
            setSubmittingResponse(false);
        }
    };

    // ── Discharge Summary Management ──
    const handleDischargeMedChange = (index, field, value) => {
        setDischargeSummary(prev => {
            const updated = [...prev.dischargeMedications];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, dischargeMedications: updated };
        });
    };

    const addDischargeMed = () => {
        setDischargeSummary(prev => ({
            ...prev,
            dischargeMedications: [...prev.dischargeMedications, createEmptyDischargeMedRow()]
        }));
    };

    const removeDischargeMed = (index) => {
        setDischargeSummary(prev => {
            if (prev.dischargeMedications.length <= 1) {
                return { ...prev, dischargeMedications: [createEmptyDischargeMedRow()] };
            }
            return {
                ...prev,
                dischargeMedications: prev.dischargeMedications.filter((_, i) => i !== index)
            };
        });
    };

    const handleSaveDischargeSummary = async (statusToSet = 'DRAFT') => {
        if (!activeAdmission?._id) {
            setErrorMsg('Active admission required to save discharge summary.');
            return;
        }

        if (statusToSet === 'FINALIZED' && !dischargeSummary.diagnosis.trim()) {
            setErrorMsg('Final clinical diagnosis is required to sign discharge summary.');
            return;
        }

        setSavingSummary(true);
        setErrorMsg('');
        try {
            const payload = {
                ...dischargeSummary,
                status: statusToSet
            };

            const res = await ipdClinicalAPI.saveDischargeSummary(activeAdmission._id, payload);
            if (res.success) {
                setSuccessMsg(statusToSet === 'FINALIZED'
                    ? '🎉 Discharge Summary FINALIZED & Signed! Clinical Discharge Ordered.'
                    : 'Discharge Summary draft saved successfully.'
                );
                fetchDischargeSummary();
                fetchAdmission();
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || 'Error saving discharge summary');
        } finally {
            setSavingSummary(false);
        }
    };

    // Print Discharge Summary
    const handlePrintSummary = () => {
        window.print();
    };

    const patientName = patient?.name || patient?.userId?.name || 'Selected Patient';
    const patientMRN = patient?.patientId || patient?.mrn || 'N/A';
    const openClarificationsCount = useMemo(() => {
        return clarifications.filter(c => c.status === 'OPEN').length;
    }, [clarifications]);

    const filteredNotes = useMemo(() => {
        return nursingNotes.filter(n => {
            if (notesFilterCategory !== 'ALL' && n.noteType !== notesFilterCategory) return false;
            if (notesFilterShift !== 'ALL' && n.shift !== notesFilterShift) return false;
            if (notesFilterPriority !== 'ALL' && n.priority !== notesFilterPriority) return false;
            return true;
        });
    }, [nursingNotes, notesFilterCategory, notesFilterShift, notesFilterPriority]);

    return (
        <div className="ipd-orders-panel">
            {/* ====== EXECUTIVE IPD HEADER BANNER ====== */}
            {!hideHeaderBanner && (
            <div className="ipd-header-banner">
                <div className="ipd-banner-left">
                    <div className="ipd-banner-icon-badge">
                        <FiActivity className="ipd-banner-icon" />
                    </div>
                    <div className="ipd-banner-info">
                        <div className="ipd-banner-title-row">
                            <h3 className="ipd-banner-title">IPD Clinical Care &amp; Doctor Orders</h3>
                            <span className="ipd-banner-tag">Inpatient Care Unit</span>
                        </div>
                    </div>
                </div>

                <div className="ipd-banner-right">
                    {loadingAdmission ? (
                        <div className="ipd-status-card checking">
                            <span className="ipd-pulse-dot amber"></span>
                            <div className="ipd-status-card-text">
                                <span className="ipd-status-card-title">Admission Status</span>
                                <span className="ipd-status-card-val">Checking Records...</span>
                            </div>
                        </div>
                    ) : activeAdmission ? (
                        <div className="ipd-banner-actions-wrap" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setTprModalOpen(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    background: '#0d9488',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                                title="View, Print & Download Bedside TPR Chart"
                            >
                                <FiPrinter size={14} />
                                <span>TPR Chart</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setClinicalNotesModalOpen(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    background: '#0f2e7a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                                title="2-Page In-Patient Clinical Notes & Patient Communication"
                            >
                                <FiFileText size={14} />
                                <span>Clinical Notes</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setClinicalChartsModal({ open: true, tab: 'progress_notes' })}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    background: '#0f766e',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                                title="1-Page Clinical Progress Notes"
                            >
                                <FiFileText size={14} />
                                <span>Progress Notes</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_stat_iv' })}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    background: '#1e3a8a',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                                title="2-Page Drug Chart (STAT Doses, IV Fluids & Scheduled MAR Grid)"
                            >
                                <FiFileText size={14} />
                                <span>Drug Chart</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setIcuChartModalOpen(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    background: '#0284c7',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '12.5px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                                title="Official 2-Page ICU Daily Observation Chart"
                            >
                                <FiActivity size={14} />
                                <span>ICU Chart</span>
                            </button>
                            <div className="ipd-status-card admitted">
                                <span className="ipd-pulse-dot green"></span>
                                <div className="ipd-status-card-text">
                                    <div className="ipd-status-badge-row">
                                        <span className="ipd-status-live-badge">Hospitalized / Admitted</span>
                                    </div>
                                    <div className="ipd-status-location-row">
                                        <span className="ipd-ward-pill">
                                            <FiMapPin /> {activeAdmission.ward || 'General Ward'}
                                        </span>
                                        <span className="ipd-bed-pill">
                                            Bed {activeAdmission.bedNumber || activeAdmission.bedId?.bedNumber || 'Assigned'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="ipd-status-card opd">
                            <span className="ipd-pulse-dot amber"></span>
                            <div className="ipd-status-card-text">
                                <span className="ipd-status-card-title">Outpatient Record</span>
                                <span className="ipd-status-card-val">⚠️ Not Hospitalized (OPD Patient)</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* Sub-Navigation Tabs (All 11+ Clinical Sections) */}
            <div className="ipd-sub-tabs">
                {[
                    { key: 'overview', label: 'Overview', icon: <FiEye /> },
                    { key: 'treatment_chart', label: 'Treatment Chart', icon: <FiLayers />, count: existingOrders.length },
                    { key: 'tpr_vitals', label: 'TPR & Vitals', icon: <FiActivity />, count: vitalsList.length },
                    ...(isICUPatient ? [{ key: 'icu_chart', label: '⚡ ICU Chart', icon: <FiActivity />, isICU: true }] : []),
                    { key: 'progress_notes', label: 'Progress Notes', icon: <FiFileText />, count: progressNotes.length },
                    { key: 'clinical_notes', label: 'Clinical Notes', icon: <FiFileText /> },
                    { key: 'drug_chart', label: 'Drug Chart', icon: <FiDroplet /> },
                    { key: 'mar', label: 'Medication Administration', icon: <FiClock />, count: marList.length },
                    { key: 'notes', label: 'Nursing Notes', icon: <FiMessageSquare />, count: nursingNotes.length },
                    { key: 'clarifications', label: 'Patient Communication', icon: <FiHelpCircle />, count: openClarificationsCount || clarifications.length },
                    { key: 'investigations', label: 'Investigations', icon: <FiFileText /> },
                    { key: 'discharge', label: 'Discharge Summary', icon: <FiFileText />, isSigned: summaryDoctorSigned }
                ].map(tab => {
                    const isActive = activeTab === tab.key || (tab.key === 'treatment_chart' && activeTab === 'orders');
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            className={`sub-tab-btn ${isActive ? 'active' : ''} ${tab.isICU ? 'tab-icu-highlight' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`count-pill ${tab.key === 'clarifications' && openClarificationsCount > 0 ? 'badge-urgent' : ''}`}>
                                    {tab.count}
                                </span>
                            )}
                            {tab.isSigned && (
                                <span className="count-pill badge-signed">✓ Signed</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Notification messages */}
            {errorMsg && (
                <div className="ipd-alert-msg error">
                    <FiAlertCircle />
                    <span>{errorMsg}</span>
                </div>
            )}
            {successMsg && (
                <div className="ipd-alert-msg success">
                    <FiCheckCircle />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Unadmitted Warning & Quick Hospitalize Banner */}
            {!loadingAdmission && !activeAdmission && (
                <div className="ipd-unadmitted-banner" style={{
                    background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                    border: '1.5px solid #fcd34d',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                    boxShadow: '0 2px 10px rgba(245, 158, 11, 0.1)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '2.2rem' }}>🏥</span>
                        <div>
                            <h4 style={{ margin: '0 0 4px', fontSize: '1.02rem', color: '#92400e', fontWeight: 800 }}>
                                Patient Not Hospitalized / Admitted in IPD
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.86rem', color: '#78350f', lineHeight: 1.4 }}>
                                This patient is currently an Outpatient (OPD). Inpatient clinical orders, MAR administration, and nursing care require the patient to be admitted with an assigned ward and bed.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="ipd-btn-hospitalize-now"
                        onClick={handleOpenHospitalizeModal}
                        style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 20px',
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <FiPlus size={16} /> Hospitalize / Admit Patient
                    </button>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 1: OVERVIEW & CLINICAL RECORDS DASHBOARD
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
                <div className="ipd-overview-section">
                    {/* Clinical Overview Banner */}
                    <div className="ipd-overview-banner">
                        <div>
                            <h4 className="ipd-overview-title">
                                {patientName} • Inpatient Clinical Records &amp; Overview
                            </h4>
                            <p className="ipd-overview-sub">
                                Diagnosis: <strong>{diagnosis || activeAdmission?.diagnosis || 'Clinical Inpatient Care'}</strong> &nbsp;|&nbsp;
                                Location: <strong>{activeAdmission?.ward || 'Ward'} • Bed {activeAdmission?.bedNumber || 'Assigned'}</strong> &nbsp;|&nbsp;
                                Consultant: <strong>{activeAdmission?.consultant || `Dr. ${activeDoctor?.name || 'Attending'}`}</strong>
                            </p>
                        </div>

                        {isICUPatient && (
                            <span className="doc-ipd-icu-badge" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                                ⚡ CRITICAL CARE ICU PATIENT
                            </span>
                        )}
                    </div>

                    {/* Official Document Launcher Cards */}
                    <div>
                        <h5 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                            OFFICIAL CLINICAL CHARTS &amp; DOCUMENTS (SHARED DOCTOR / NURSE STREAM)
                        </h5>
                        <div className="ipd-quick-cards-grid">
                            <div className="ipd-quick-doc-card tpr" onClick={() => setTprModalOpen(true)}>
                                <div className="ipd-qdoc-header">
                                    <div className="ipd-qdoc-icon teal"><FiPrinter /></div>
                                    <h6 className="ipd-qdoc-title">TPR Bedside Chart</h6>
                                </div>
                                <p className="ipd-qdoc-desc">
                                    Dynamic 10-column temperature, pulse, respiration, BP &amp; fluid intake/output record.
                                </p>
                                <span className="ipd-qdoc-action-label">Open Bedside TPR Chart →</span>
                            </div>

                            <div className="ipd-quick-doc-card progress" onClick={() => setClinicalChartsModal({ open: true, tab: 'progress_notes' })}>
                                <div className="ipd-qdoc-header">
                                    <div className="ipd-qdoc-icon emerald"><FiFileText /></div>
                                    <h6 className="ipd-qdoc-title">Clinical Progress Notes</h6>
                                </div>
                                <p className="ipd-qdoc-desc">
                                    Official 1-page progress notes with continuation sheets and NABH letterhead.
                                </p>
                                <span className="ipd-qdoc-action-label">Open Progress Notes →</span>
                            </div>

                            <div className="ipd-quick-doc-card clinical" onClick={() => setClinicalNotesModalOpen(true)}>
                                <div className="ipd-qdoc-header">
                                    <div className="ipd-qdoc-icon navy"><FiFileText /></div>
                                    <h6 className="ipd-qdoc-title">Clinical Notes (2-Page)</h6>
                                </div>
                                <p className="ipd-qdoc-desc">
                                    Official two-page form: History, Examination, Treatment, Discharge &amp; Communication.
                                </p>
                                <span className="ipd-qdoc-action-label">Open Clinical Notes →</span>
                            </div>

                            <div className="ipd-quick-doc-card drug" onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_stat_iv' })}>
                                <div className="ipd-qdoc-header">
                                    <div className="ipd-qdoc-icon blue"><FiDroplet /></div>
                                    <h6 className="ipd-qdoc-title">Drug Chart (2-Page)</h6>
                                </div>
                                <p className="ipd-qdoc-desc">
                                    STAT Doses, Continuous IV Infusions, Allergies &amp; 4-Day Scheduled MAR Grid.
                                </p>
                                <span className="ipd-qdoc-action-label">Open Drug Chart →</span>
                            </div>

                            <div
                                className={`ipd-quick-doc-card icu ${isICUPatient ? 'highlighted' : ''}`}
                                onClick={() => setIcuChartModalOpen(true)}
                            >
                                <div className="ipd-qdoc-header">
                                    <div className={`ipd-qdoc-icon ${isICUPatient ? 'red' : 'sky'}`}><FiActivity /></div>
                                    <h6 className="ipd-qdoc-title">{isICUPatient ? '⚡ ICU Chart (Official)' : 'ICU Observation Chart'}</h6>
                                </div>
                                <p className="ipd-qdoc-desc">
                                    Official two-page landscape chart: 24h vitals, ventilator, diabetic chart &amp; diet orders.
                                </p>
                                <span className="ipd-qdoc-action-label">Open ICU Chart →</span>
                            </div>
                        </div>
                    </div>

                    {/* Latest Vitals Snapshot */}
                    <div className="ipd-summary-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <h5 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiActivity style={{ color: '#0284c7' }} /> Latest Bedside Vitals (Shared Stream)
                            </h5>
                            <button
                                type="button"
                                className="doc-ipd-mini-btn"
                                onClick={() => setActiveTab('tpr_vitals')}
                            >
                                View Full Vitals History ({vitalsList.length}) →
                            </button>
                        </div>

                        {vitalsList.length === 0 ? (
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>
                                No bedside vitals recorded yet. When nursing staff records vitals at bedside, they synchronize here live.
                            </p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>BP (Blood Pressure)</span>
                                    <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                                        {vitalsList[0].systolicBP && vitalsList[0].diastolicBP ? `${vitalsList[0].systolicBP}/${vitalsList[0].diastolicBP}` : '—'}
                                    </strong>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Pulse / Heart Rate</span>
                                    <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                                        {vitalsList[0].pulse ? `${vitalsList[0].pulse} bpm` : '—'}
                                    </strong>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>SpO₂ (Oxygen)</span>
                                    <strong style={{ fontSize: '1.1rem', color: vitalsList[0].spo2 && vitalsList[0].spo2 < 95 ? '#dc2626' : '#059669' }}>
                                        {vitalsList[0].spo2 ? `${vitalsList[0].spo2}%` : '—'}
                                    </strong>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Temperature</span>
                                    <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                                        {vitalsList[0].temperature ? `${vitalsList[0].temperature} °F` : '—'}
                                    </strong>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Resp Rate</span>
                                    <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>
                                        {vitalsList[0].respiratoryRate ? `${vitalsList[0].respiratoryRate} /min` : '—'}
                                    </strong>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 2: TPR & BEDSIDE VITALS
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'tpr_vitals' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>Bedside Temperature, Pulse, Respiration (TPR) &amp; Vitals Stream</h4>
                            <p>Real-time bedside vitals recorded by nurses and doctors. Synchronized with the official Bedside TPR Chart.</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-action-launch-btn teal"
                            onClick={() => setTprModalOpen(true)}
                        >
                            <FiPrinter size={15} /> <span>Open &amp; Print Bedside TPR Chart</span>
                        </button>
                    </div>

                    <div className="ipd-clinical-table-wrapper">
                        {loadingVitals ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                <FiRefreshCw className="spinning" size={24} />
                                <p style={{ marginTop: '8px' }}>Loading vitals history...</p>
                            </div>
                        ) : vitalsList.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                <p style={{ margin: 0, fontWeight: 600 }}>No vitals recorded yet for this admission.</p>
                                <span style={{ fontSize: '0.82rem' }}>Bedside vital readings recorded by nurses appear here automatically.</span>
                            </div>
                        ) : (
                            <table className="ipd-clinical-table">
                                <thead>
                                    <tr>
                                        <th>Date &amp; Time</th>
                                        <th>BP (mmHg)</th>
                                        <th>Pulse (bpm)</th>
                                        <th>Temp (°F)</th>
                                        <th>SpO₂ (%)</th>
                                        <th>Resp (/min)</th>
                                        <th>Pain</th>
                                        <th>Recorded By</th>
                                        <th>Clinical Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vitalsList.map((v, i) => (
                                        <tr key={v._id || i}>
                                            <td style={{ fontWeight: 600 }}>
                                                {new Date(v.recordedAt || v.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td>{v.systolicBP && v.diastolicBP ? `${v.systolicBP}/${v.diastolicBP}` : '—'}</td>
                                            <td>{v.pulse || '—'}</td>
                                            <td>{v.temperature ? `${v.temperature}°F` : '—'}</td>
                                            <td style={{ color: v.spo2 && v.spo2 < 95 ? '#dc2626' : 'inherit', fontWeight: v.spo2 && v.spo2 < 95 ? 800 : 500 }}>
                                                {v.spo2 ? `${v.spo2}%` : '—'}
                                            </td>
                                            <td>{v.respiratoryRate || '—'}</td>
                                            <td>{v.painScore !== undefined ? v.painScore : '—'}</td>
                                            <td>{v.recordedBy?.name || v.recordedByName || 'Staff Nurse'}</td>
                                            <td style={{ color: '#64748b', fontStyle: v.remark ? 'normal' : 'italic' }}>
                                                {v.remark || 'Routine monitoring'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 3: ICU DAILY OBSERVATION CHART
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'icu_chart' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>Intensive Care Unit (ICU) Daily Observation Chart</h4>
                            <p>Official two-page landscape clinical document containing 24h hourly vitals, ventilator parameters, diabetic monitoring, and diet orders.</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-action-launch-btn red"
                            onClick={() => setIcuChartModalOpen(true)}
                        >
                            <FiActivity size={15} /> <span>Open Official 2-Page ICU Chart (Preview &amp; Print)</span>
                        </button>
                    </div>

                    {!isICUPatient ? (
                        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '24px', color: '#92400e' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <span style={{ fontSize: '1.4rem' }}>ℹ️</span>
                                <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>General / Private Inpatient Record</h5>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5 }}>
                                Patient is currently assigned to <strong>{activeAdmission?.ward || 'General Ward'} (Bed {activeAdmission?.bedNumber || 'Assigned'})</strong>.
                                The ICU Daily Observation Chart is specifically designed for ICU / CCU / Critical Care bed assignments.
                                You can still click the button above to generate or print a blank/preview ICU chart at any time.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            <div className="ipd-summary-box">
                                <h5>⚡ 24-Hour Hourly Vitals Monitoring</h5>
                                <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 12px 0' }}>
                                    Tracks 8 AM to 7 AM (Pulse, BP, Temp, SpO₂, CVP, GCS) on Page 1.
                                </p>
                                <button type="button" className="doc-ipd-mini-btn" onClick={() => setIcuChartModalOpen(true)}>
                                    View 24-Hour Grid →
                                </button>
                            </div>

                            <div className="ipd-summary-box">
                                <h5>🫁 Ventilatory Settings &amp; Parameters</h5>
                                <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 12px 0' }}>
                                    Mode, Tidal Volume, RR, PEEP, FiO₂, PIP &amp; Pressure Support on Page 2.
                                </p>
                                <button type="button" className="doc-ipd-mini-btn" onClick={() => setIcuChartModalOpen(true)}>
                                    View Ventilatory Table →
                                </button>
                            </div>

                            <div className="ipd-summary-box">
                                <h5>💧 Intake &amp; Output Balance</h5>
                                <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 12px 0' }}>
                                    Oral, NG, IV, Infusion, Urine, Drain, Stool and RTA fluid monitoring.
                                </p>
                                <button type="button" className="doc-ipd-mini-btn" onClick={() => setIcuChartModalOpen(true)}>
                                    View Fluid Balance →
                                </button>
                            </div>

                            <div className="ipd-summary-box">
                                <h5>🩸 Diabetic Chart &amp; Diet Orders</h5>
                                <p style={{ fontSize: '0.84rem', color: '#64748b', margin: '0 0 12px 0' }}>
                                    Hourly blood sugar monitoring, insulin units, and physician diet instructions.
                                </p>
                                <button type="button" className="doc-ipd-mini-btn" onClick={() => setIcuChartModalOpen(true)}>
                                    View Diabetic Chart →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 4: CLINICAL PROGRESS NOTES
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'progress_notes' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>Clinical Progress Notes (Doctor &amp; Clinical Staff Workspace)</h4>
                            <p>Ruled chronological progress observations, continuation sheets, and NABH-compliant hospital letterhead.</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-action-launch-btn progress"
                            onClick={() => setClinicalChartsModal({ open: true, tab: 'progress_notes' })}
                        >
                            <FiFileText size={15} /> <span>View Official 1-Page Progress Notes PDF</span>
                        </button>
                    </div>

                    {/* Add New Progress Note Form */}
                    <div className="ipd-progress-add-card">
                        <h5>
                            <FiPlus style={{ color: '#0f766e' }} /> Write New Clinical Progress Observation
                        </h5>
                        <form onSubmit={handleAddProgressNote}>
                            <div className="ipd-progress-form-grid">
                                    <div>
                                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                            Observation Date &amp; Time
                                        </label>
                                        <input
                                            type="datetime-local"
                                            className="ipd-progress-input ipd-obs-datetime-input"
                                            value={newProgressNote.recordedAt || toLocalDateTimeInput()}
                                            onChange={(e) => setNewProgressNote(prev => ({ ...prev, recordedAt: e.target.value || toLocalDateTimeInput() }))}
                                        />
                                    </div>
                                <div>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                        Sheet No.
                                    </label>
                                    <input
                                        type="text"
                                        className="ipd-progress-input"
                                        value={newProgressNote.sheetNo}
                                        onChange={(e) => setNewProgressNote(prev => ({ ...prev, sheetNo: e.target.value }))}
                                        placeholder="1"
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                        Clinical Progress Observation <span style={{ color: '#dc2626' }}>*</span>
                                    </label>
                                    <textarea
                                        className="ipd-progress-textarea"
                                        placeholder="Enter clinical examination, progress remarks, patient response, and plan..."
                                        value={newProgressNote.note}
                                        onChange={(e) => setNewProgressNote(prev => ({ ...prev, note: e.target.value }))}
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="ipd-btn-save-note"
                                    disabled={savingProgressNote}
                                >
                                    <FiSave />
                                    <span>{savingProgressNote ? 'Saving...' : 'Save Note'}</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Chronological Progress Notes List */}
                    <div className="ipd-progress-list">
                        {loadingProgressNotes ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                <FiRefreshCw className="spinning" size={20} />
                                <p style={{ marginTop: '6px' }}>Loading progress notes...</p>
                            </div>
                        ) : progressNotes.length === 0 ? (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                <p style={{ margin: 0, fontWeight: 600 }}>No progress notes recorded yet for this admission.</p>
                                <span style={{ fontSize: '0.82rem' }}>Use the form above to add your first clinical progress observation.</span>
                            </div>
                        ) : (
                            progressNotes.map((pn, idx) => (
                                <div key={pn._id || idx} className="ipd-progress-item-card">
                                    <div className="ipd-progress-item-header">
                                        <div className="ipd-pitem-meta">
                                            <span className="ipd-pitem-sheet-badge">Sheet #{pn.sheetNo || 1}</span>
                                            <span style={{ fontWeight: 600 }}>
                                                {new Date(pn.recordedAt || pn.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span>•</span>
                                            <span className="ipd-pitem-author">
                                                {pn.authorName || 'Physician'} {pn.authorRole ? `(${pn.authorRole})` : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="ipd-pitem-text">{pn.note}</div>
                                    {pn.editHistory?.length > 0 && (
                                        <div className="ipd-pitem-audit-trail">
                                            Last modified by {pn.editHistory[pn.editHistory.length - 1].editedBy} on{' '}
                                            {new Date(pn.editHistory[pn.editHistory.length - 1].editedAt).toLocaleDateString('en-GB')}
                                            {pn.editHistory[pn.editHistory.length - 1].editReason ? ` (Reason: ${pn.editHistory[pn.editHistory.length - 1].editReason})` : ''}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 5: IN-PATIENT CLINICAL NOTES (2-PAGE)
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'clinical_notes' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>In-Patient Clinical Notes (Official Two-Page IPD Form)</h4>
                            <p>History, Physical Examination, Diagnostic Investigations, Condition at Discharge, and Patient &amp; Nurse Communication.</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-action-launch-btn navy"
                            onClick={() => setClinicalNotesModalOpen(true)}
                        >
                            <FiFileText size={15} /> <span>Open Official 2-Page Clinical Notes Form &amp; PDF</span>
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        <div className="ipd-summary-box">
                            <h5>📑 Page 1: Clinical History &amp; Presenting Complaints</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                {clinicalNotesData?.history || 'History of present illness and admission indications recorded in inpatient form.'}
                            </p>
                            <button type="button" className="doc-ipd-mini-btn" onClick={() => setClinicalNotesModalOpen(true)}>
                                Edit Page 1 Details →
                            </button>
                        </div>

                        <div className="ipd-summary-box">
                            <h5>🩺 Page 1: Physical Examination &amp; Systemic Findings</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                {clinicalNotesData?.physicalExam || 'General condition, systemic evaluation, CVS, RS, CNS and abdominal examination.'}
                            </p>
                            <button type="button" className="doc-ipd-mini-btn" onClick={() => setClinicalNotesModalOpen(true)}>
                                Edit Examination →
                            </button>
                        </div>

                        <div className="ipd-summary-box">
                            <h5>💬 Page 2: Patient &amp; Nurse Communication</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                Chronological dialogue notes, bedside nursing communication, and patient-family updates.
                            </p>
                            <button type="button" className="doc-ipd-mini-btn" onClick={() => setClinicalNotesModalOpen(true)}>
                                View Patient Communication →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 6: INPATIENT DRUG CHART (STAT & IV)
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'drug_chart' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>Inpatient Drug Chart (Allergies, STAT Prescriptions &amp; Continuous IV Fluids)</h4>
                            <p>Official 2-page clinical chart for Once-Only STAT doses, IV fluids, and Drug Allergies.</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-action-launch-btn blue"
                            onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_stat_iv' })}
                        >
                            <FiDroplet size={15} /> <span>Open Official 2-Page Drug Chart Form &amp; PDF</span>
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        <div className="ipd-summary-box">
                            <h5>🚫 Known Drug Allergies</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                {drugChartData?.allergies?.length > 0 ? drugChartData.allergies.join(', ') : 'No known drug allergies reported (NKDA).'}
                            </p>
                            <button type="button" className="doc-ipd-mini-btn" onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_stat_iv' })}>
                                Update Allergies →
                            </button>
                        </div>

                        <div className="ipd-summary-box">
                            <h5>⚡ Once-Only (STAT) Prescriptions</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                {drugChartData?.statDoses?.length > 0
                                    ? `${drugChartData.statDoses.length} STAT prescriptions recorded.`
                                    : 'No emergency STAT doses prescribed yet.'}
                            </p>
                            <button type="button" className="doc-ipd-mini-btn" onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_stat_iv' })}>
                                Prescribe STAT Dose →
                            </button>
                        </div>

                        <div className="ipd-summary-box">
                            <h5>💧 Continuous I.V. Fluid Infusions</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                {drugChartData?.ivFluids?.length > 0
                                    ? `${drugChartData.ivFluids.length} IV fluid infusions active.`
                                    : 'No continuous IV fluids ordered.'}
                            </p>
                            <button type="button" className="doc-ipd-mini-btn" onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_stat_iv' })}>
                                Order IV Fluid →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 7: MEDICATION ADMINISTRATION RECORD (MAR)
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'mar' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>Medication Administration Record (4-Day Scheduled MAR Grid)</h4>
                            <p>Daily scheduled administration grid (06 AM, 10 AM, 02 PM, 10 PM) with actual bedside nurse administration tracking.</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-action-launch-btn navy"
                            onClick={() => setClinicalChartsModal({ open: true, tab: 'drug_mar' })}
                        >
                            <FiClock size={15} /> <span>Open 4-Day MAR Grid PDF</span>
                        </button>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 18px', marginBottom: '16px', fontSize: '0.82rem', color: '#475569' }}>
                        🔒 <strong>Doctor Clinical Audit Mode:</strong> Doctors review administration timelines and compliance. Bedside administration is confirmed and recorded by nursing staff.
                    </div>

                    <div className="ipd-clinical-table-wrapper">
                        {loadingMar ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                <FiRefreshCw className="spinning" size={20} />
                                <p style={{ marginTop: '6px' }}>Loading MAR records...</p>
                            </div>
                        ) : marList.length === 0 ? (
                            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                                <p style={{ margin: 0, fontWeight: 600 }}>No MAR administration records yet.</p>
                                <span style={{ fontSize: '0.82rem' }}>Prescribe medications in the Treatment Chart tab to automatically generate the MAR schedule.</span>
                            </div>
                        ) : (
                            <table className="ipd-clinical-table">
                                <thead>
                                    <tr>
                                        <th>Medicine Name</th>
                                        <th>Route</th>
                                        <th>Scheduled Time</th>
                                        <th>Status</th>
                                        <th>Administered By</th>
                                        <th>Administration Time</th>
                                        <th>Nurse Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {marList.slice(0, 25).map((m, idx) => (
                                        <tr key={m._id || idx}>
                                            <td style={{ fontWeight: 700 }}>{m.medicineName}</td>
                                            <td>{m.route || 'Oral'}</td>
                                            <td>{m.scheduledTime || '10:00 AM'}</td>
                                            <td>
                                                <span className={`ipd-pill-tag ${m.status === 'ADMINISTERED' || m.status === 'GIVEN' ? 'given' : m.isOverdue ? 'overdue' : 'pending'}`}>
                                                    {m.status || 'SCHEDULED'}
                                                </span>
                                            </td>
                                            <td>{m.administeredBy?.name || m.administeredByName || '—'}</td>
                                            <td>
                                                {m.administeredAt ? new Date(m.administeredAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td style={{ color: '#64748b' }}>{m.notes || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════
                SECTION 8: INVESTIGATIONS & DIET CHART
                ══════════════════════════════════════════════════════════ */}
            {activeTab === 'investigations' && (
                <div>
                    <div className="ipd-clinical-top-bar">
                        <div>
                            <h4>Clinical Investigations, Lab Reports &amp; Diet Orders</h4>
                            <p>Diagnostic laboratory tests, imaging reports, and prescribed inpatient diet regimen.</p>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                        <div className="ipd-summary-box">
                            <h5>🔬 Diagnostic Investigations &amp; Reports</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                Inpatient lab tests, CBC, blood chemistry, radiology, and ECG reports linked to this admission.
                            </p>
                            <span style={{ fontSize: '0.82rem', color: '#0284c7', fontWeight: 600 }}>Synchronized with Hospital Lab Information System (LIS)</span>
                        </div>

                        <div className="ipd-summary-box">
                            <h5>🥗 Inpatient Diet Chart Regimen</h5>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                                Soft diet, diabetic diet, low sodium, NPO, or clear liquid diet prescribed by attending physician.
                            </p>
                            <span style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>Synchronized with Inpatient Dietary Kitchen</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TAB: INPATIENT ORDERS ENTRY & LIST ── */}
            {(activeTab === 'treatment_chart' || activeTab === 'orders') && (
                <div>
                    {/* Orders Creation Form */}
                    <form onSubmit={handleSubmitOrders}>
                        {/* Section 1: Clinical Admission Indication */}
                        <div className="ipd-section">
                            <div className="ipd-section-header">
                                <div className="ipd-section-title-wrapper">
                                    <h4 className="ipd-section-title">
                                        <span className="ipd-sec-icon">🩺</span> Clinical Admission Indication
                                    </h4>
                                    <span className="ipd-sec-subtitle">
                                        Primary diagnosis and clinical justification for hospital inpatient stay
                                    </span>
                                </div>
                            </div>
                            <div className="ipd-form-grid-2">
                                <div className="ipd-field-group">
                                    <label>Clinical Diagnosis <span className="req">*</span></label>
                                    <input
                                        type="text"
                                        className="ipd-input"
                                        placeholder="e.g. Acute Appendicitis, Severe Sepsis, Left Femur Fracture"
                                        value={diagnosis}
                                        onChange={(e) => setDiagnosis(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="ipd-field-group">
                                    <label>Primary Admission Indication</label>
                                    <CustomSelect
                                        className="ipd-select"
                                        value={admissionReason}
                                        onChange={(e) => setAdmissionReason(e.target.value)}
                                    >
                                        {ADMISSION_REASONS.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </CustomSelect>
                                </div>
                            </div>

                            {admissionReason === 'Other Clinical Indication' && (
                                <div className="ipd-field-group" style={{ marginTop: '14px' }}>
                                    <label>Specify Indication <span className="req">*</span></label>
                                    <input
                                        type="text"
                                        className="ipd-input"
                                        placeholder="Enter specific medical indication..."
                                        value={customReason}
                                        onChange={(e) => setCustomReason(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Section 2: Inpatient Medications */}
                        <div className="ipd-section">
                            <div className="ipd-section-header">
                                <div className="ipd-section-title-wrapper">
                                    <h4 className="ipd-section-title">
                                        <span className="ipd-sec-icon">💊</span> Inpatient Medication Orders (MAR Linked)
                                    </h4>
                                    <span className="ipd-sec-subtitle">
                                        Physician electronic prescriptions synchronized with Nurse eMAR schedule
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="ipd-btn-add-drug"
                                    onClick={addMedRow}
                                    title="Add another medicine"
                                >
                                    <FiPlus /> Add Medicine
                                </button>
                            </div>

                            {medicationRows.map((med, idx) => (
                                <div key={idx} className="ipd-med-card">
                                    <div className="ipd-med-card-header">
                                        <div className="ipd-med-badge-group">
                                            <span className="ipd-med-number-badge">Medication #{idx + 1}</span>
                                            {med.medicineName && (
                                                <span className="ipd-med-name-preview">{med.medicineName}</span>
                                            )}
                                            {pharmacyMedicines.length > 0 && (
                                                <span className="ipd-pharmacy-pill">
                                                    🏬 Pharmacy Catalog ({pharmacyMedicines.length})
                                                </span>
                                            )}
                                        </div>
                                        {medicationRows.length > 1 && (
                                            <button
                                                type="button"
                                                className="ipd-btn-remove-drug"
                                                onClick={() => removeMedRow(idx)}
                                                title="Remove Medication"
                                            >
                                                <FiTrash2 /> Remove
                                            </button>
                                        )}
                                    </div>

                                    <div className="ipd-med-grid-top">
                                        <div className="ipd-field-group">
                                            <label>Medicine Name #{idx + 1} <span className="req">*</span></label>
                                            <CustomSelect
                                                className="ipd-select"
                                                value={med.medicineName || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleMedRowChange(idx, 'medicineName', val);
                                                    const matched = pharmacyMedicines.find(p => p.name === val);
                                                    if (matched) {
                                                        handleSelectPharmacyMedicine(idx, matched);
                                                    }
                                                }}
                                            >
                                                <option value="">Select Medicine</option>
                                                {med.medicineName && !pharmacyMedicines.some(p => p.name === med.medicineName) && (
                                                    <option value={med.medicineName}>{med.medicineName} (Selected)</option>
                                                )}
                                                {pharmacyMedicines.map((item, i) => (
                                                    <option key={item._id || i} value={item.name}>
                                                        {item.name} {item.salt ? `(${item.salt})` : ''} — {item.category || 'General'} (Stock: {item.stock ?? item.quantity ?? 0} {item.unit || ''})
                                                    </option>
                                                ))}
                                            </CustomSelect>
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Dose <span className="req">*</span></label>
                                            <input
                                                type="number"
                                                className="ipd-input"
                                                placeholder="e.g. 500"
                                                value={med.dosageValue}
                                                onChange={(e) => handleMedRowChange(idx, 'dosageValue', e.target.value)}
                                            />
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Unit</label>
                                            <select
                                                className="ipd-select"
                                                value={med.dosageUnit}
                                                onChange={(e) => handleMedRowChange(idx, 'dosageUnit', e.target.value)}
                                            >
                                                {COMMON_UNITS.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Route</label>
                                            <select
                                                className="ipd-select"
                                                value={med.route}
                                                onChange={(e) => handleMedRowChange(idx, 'route', e.target.value)}
                                            >
                                                {COMMON_ROUTES.map(rt => (
                                                    <option key={rt} value={rt}>{rt}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="ipd-med-grid-bottom">
                                        <div className="ipd-field-group">
                                            <label>Frequency</label>
                                            <CustomSelect
                                                className="ipd-select"
                                                value={med.frequency}
                                                onChange={(e) => handleMedRowChange(idx, 'frequency', e.target.value)}
                                            >
                                                {COMMON_FREQUENCIES.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </CustomSelect>
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Duration</label>
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="e.g. 5 days, STAT"
                                                value={med.duration}
                                                onChange={(e) => handleMedRowChange(idx, 'duration', e.target.value)}
                                            />
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Nursing Administration Instructions</label>
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="e.g. Slow IV push over 15 mins, after food"
                                                value={med.instructions}
                                                onChange={(e) => handleMedRowChange(idx, 'instructions', e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Manual Administration Timing Selector */}
                                    <div className="ipd-med-timing-box">
                                        <div className="ipd-timing-header">
                                            <label className="ipd-timing-label">
                                                <FiClock size={14} className="ipd-timing-icon" />
                                                Manual Administration Time Slots ({med.frequency || 'OD'}):
                                            </label>
                                            <button
                                                type="button"
                                                className="ipd-btn-add-time-slot"
                                                onClick={() => handleAddTimeSlot(idx)}
                                            >
                                                <FiPlus size={12} /> Add Dose Time
                                            </button>
                                        </div>
                                        <div className="ipd-timing-slots-row">
                                            {(med.scheduledTimes || []).map((slot, sIdx) => (
                                                <div key={sIdx} className="ipd-time-slot-pill">
                                                    <span className="ipd-slot-prefix">Dose {sIdx + 1}:</span>
                                                    <input
                                                        type="text"
                                                        value={slot}
                                                        onChange={(e) => handleTimeSlotChange(idx, sIdx, e.target.value)}
                                                        placeholder="e.g. 10:00 AM or 14:00"
                                                        className="ipd-slot-input"
                                                    />
                                                    {(med.scheduledTimes || []).length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveTimeSlot(idx, sIdx)}
                                                            className="ipd-btn-remove-slot"
                                                            title="Remove time slot"
                                                        >
                                                            <FiX size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <span className="ipd-timing-helper-text">
                                                (Type custom time e.g. 09:30 AM or 21:00)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Section 3: Special Directives */}
                        <div className="ipd-section">
                            <div className="ipd-section-header">
                                <div className="ipd-section-title-wrapper">
                                    <h4 className="ipd-section-title">
                                        <span className="ipd-sec-icon">📋</span> Additional Nursing Directives &amp; Clinical Orders
                                    </h4>
                                    <span className="ipd-sec-subtitle">
                                        Standing instructions for laboratory investigations, surgical preparation, and shift nursing care
                                    </span>
                                </div>
                            </div>
                            <div className="ipd-form-grid-3">
                                <div className="ipd-field-group ipd-directive-card">
                                    <label className="ipd-directive-title">
                                        <span>🔬 Lab / Diagnostic Advice</span>
                                    </label>
                                    <textarea
                                        className="ipd-textarea"
                                        placeholder="e.g. CBC, Serum Creatinine, Chest X-Ray stat..."
                                        value={investigationNotes}
                                        onChange={(e) => setInvestigationNotes(e.target.value)}
                                        rows={3}
                                    />
                                    <span className="ipd-dir-hint">Pathology, radiology, and urgent bedside tests</span>
                                </div>

                                <div className="ipd-field-group ipd-directive-card">
                                    <label className="ipd-directive-title">
                                        <span>🏥 Procedure / OT Advice</span>
                                    </label>
                                    <textarea
                                        className="ipd-textarea"
                                        placeholder="e.g. NPO from midnight, prep for Laparoscopy, consent signed..."
                                        value={procedureNotes}
                                        onChange={(e) => setProcedureNotes(e.target.value)}
                                        rows={3}
                                    />
                                    <span className="ipd-dir-hint">Surgical prep, fasting guidelines, consent orders</span>
                                </div>

                                <div className="ipd-field-group ipd-directive-card">
                                    <label className="ipd-directive-title">
                                        <span>🩺 General Nursing Orders</span>
                                    </label>
                                    <textarea
                                        className="ipd-textarea"
                                        placeholder="e.g. Strict I/O charting, continuous SpO2 monitoring, elevate head..."
                                        value={clinicalNotes}
                                        onChange={(e) => setClinicalNotes(e.target.value)}
                                        rows={3}
                                    />
                                    <span className="ipd-dir-hint">Vitals monitoring frequency, position, nursing alerts</span>
                                </div>
                            </div>
                        </div>

                        <div className="ipd-actions-footer">
                            <button
                                type="submit"
                                className="ipd-btn-submit"
                                disabled={submitting || !activeAdmission}
                                title={!activeAdmission ? 'Please hospitalize the patient first to submit IPD clinical orders' : ''}
                                style={!activeAdmission ? { background: '#94a3b8', cursor: 'not-allowed', boxShadow: 'none' } : {}}
                            >
                                {!activeAdmission
                                    ? '⚠️ Hospitalize Patient First to Submit Orders'
                                    : submitting
                                    ? 'Placing Orders...'
                                    : '🚀 Submit Clinical Orders'}
                            </button>
                        </div>
                    </form>

                    {/* Active & Historical Inpatient Orders Table */}
                    <div style={{ marginTop: '28px' }}>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 12px 0', color: '#0f172a' }}>
                            📜 Current Inpatient Orders Record
                        </h4>

                        {loadingOrders ? (
                            <div className="ipd-loading-state">Loading active inpatient orders...</div>
                        ) : existingOrders.length === 0 ? (
                            <div className="ipd-empty-state">
                                No inpatient orders recorded yet for this patient.
                            </div>
                        ) : (
                            <div className="ipd-orders-table-wrapper">
                                <table className="ipd-orders-table">
                                    <thead>
                                        <tr>
                                            <th>Medicine Name</th>
                                            <th>Dose</th>
                                            <th>Route</th>
                                            <th>Frequency</th>
                                            <th>Duration / Start</th>
                                            <th>Nurse Acknowledgment</th>
                                            <th>Clarification Status</th>
                                            <th>Status</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {existingOrders.map((order) => {
                                            const isCancelled = order.status === 'CANCELLED';
                                            const isCompleted = order.status === 'COMPLETED';
                                            const isActive = order.status === 'ACTIVE';
                                            const freqInfo = getFrequencyDisplay(order.frequency, order.scheduledTimes);

                                            let badgeClass = 'ipd-status-active';
                                            if (isCancelled) badgeClass = 'ipd-status-cancelled';
                                            else if (isCompleted) badgeClass = 'ipd-status-completed';

                                            const acknowledgments = order.acknowledgments || [];
                                            const hasAck = acknowledgments.length > 0;
                                            const lastAck = hasAck ? acknowledgments[acknowledgments.length - 1] : null;

                                            const openClar = (order.clarifications || []).find(c => c.status === 'OPEN');

                                            return (
                                                <tr key={order._id}>
                                                    <td className="ipd-td-med">
                                                        <div className="ipd-med-title" title={order.clinicalNotes || undefined}>{order.medicineName}</div>
                                                        {order.instructions && (
                                                            <div className="ipd-med-inst">
                                                                📝 {order.instructions}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="ipd-td-dose">
                                                        <span className="ipd-dose-val">
                                                            {order.dosage?.value ?? order.dosageValue ?? '—'} {order.dosage?.unit || order.dosageUnit || ''}
                                                        </span>
                                                    </td>
                                                    <td className="ipd-td-route">
                                                        <span className="route-badge">{order.route || 'Oral'}</span>
                                                    </td>
                                                    <td 
                                                        className="ipd-td-freq"
                                                        title={order.scheduledTimes?.length ? `Administration Times: ${order.scheduledTimes.join(', ')}` : undefined}
                                                    >
                                                        <div className="ipd-freq-title">{freqInfo.title}</div>
                                                        {freqInfo.count && (
                                                            <span className="ipd-freq-pill">
                                                                {freqInfo.count}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="ipd-td-duration">
                                                        <div className="ipd-dur-val">{order.schedule?.duration || order.duration || '—'}</div>
                                                        {(order.schedule?.startDate || order.startDate) && (
                                                            <div className="ipd-dur-date">
                                                                {new Date(order.schedule?.startDate || order.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="ipd-td-ack">
                                                        {hasAck ? (
                                                            <span className="ack-pill acknowledged">
                                                                <FiCheck size={12} /> Ack ({lastAck.shift || 'Shift'})
                                                            </span>
                                                        ) : (
                                                            <span className="ack-pill pending">
                                                                Pending Ack
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="ipd-td-clar">
                                                        {openClar ? (
                                                            <span
                                                                className="clar-badge open-badge"
                                                                onClick={() => setActiveTab('clarifications')}
                                                                title={openClar.question}
                                                            >
                                                                ❓ Nurse Question
                                                            </span>
                                                        ) : (order.clarifications?.length > 0) ? (
                                                            <span className="clar-badge resolved-badge">
                                                                ✓ Resolved
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td className="ipd-td-status">
                                                        <span className={badgeClass}>{order.status}</span>
                                                    </td>
                                                    <td className="ipd-td-action">
                                                        {isActive && (
                                                            <button
                                                                type="button"
                                                                className="ipd-btn-cancel-sm"
                                                                onClick={() => setOrderToCancel(order)}
                                                            >
                                                                Cancel
                                                            </button>
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
            )}

            {/* ── TAB 2: NURSE CLARIFICATION INBOX ── */}
            {activeTab === 'clarifications' && (
                <div className="ipd-clarifications-panel">
                    <div className="clar-header-row">
                        <div>
                            <h4>Doctor ↔ Nurse Clinical Clarifications</h4>
                            <p>Direct communication channel for medication contraindications, dosage double-checks, and clinical inquiries</p>
                        </div>
                        <button
                            type="button"
                            className="ipd-btn-refresh-sm"
                            onClick={fetchClarifications}
                        >
                            <FiRefreshCw className={loadingClarifications ? 'spin' : ''} />
                            <span>Refresh</span>
                        </button>
                    </div>

                    {!activeAdmission ? (
                        <div className="ipd-empty-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>🏥</span>
                            <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 700 }}>Patient Not Hospitalized</h4>
                            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.9rem' }}>Nurse clarifications are active only once the patient is admitted to a ward and bed.</p>
                            <button type="button" onClick={handleOpenHospitalizeModal} className="ipd-btn-hospitalize-now" style={{ margin: '0 auto', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <FiPlus /> Hospitalize / Admit Patient
                            </button>
                        </div>
                    ) : loadingClarifications ? (
                        <div className="ipd-loading-state">Loading clarification inquiries...</div>
                    ) : clarifications.length === 0 ? (
                        <div className="ipd-empty-state">
                            <FiCheckCircle style={{ fontSize: '2rem', color: '#10b981', marginBottom: '8px' }} />
                            <div>No clarification questions pending from the nursing staff.</div>
                        </div>
                    ) : (
                        <div className="clar-threads-list">
                            {clarifications.map((item) => {
                                const isOpen = item.status === 'OPEN';
                                const isRespondingThis = activeClarificationId === item.clarificationId;

                                return (
                                    <div key={item.clarificationId} className={`clar-thread-card ${isOpen ? 'open-card' : 'resolved-card'}`}>
                                        <div className="thread-header">
                                            <div className="thread-title">
                                                <span className={`thread-status-badge ${isOpen ? 'badge-open' : 'badge-resolved'}`}>
                                                    {isOpen ? 'ACTION REQUIRED' : 'RESOLVED'}
                                                </span>
                                                <h5>{item.medicineName} ({item.dosage})</h5>
                                            </div>
                                            <span className="thread-time">
                                                {new Date(item.requestedAt).toLocaleString()}
                                            </span>
                                        </div>

                                        <div className="thread-nurse-question">
                                            <div className="nurse-meta">
                                                <strong>Nurse {item.requestedBy || 'Staff'}</strong>:
                                                <span className="issue-type-tag">{item.issueType || 'General'}</span>
                                            </div>
                                            <p className="question-text">{item.question}</p>
                                        </div>

                                        {item.responseText ? (
                                            <div className="thread-doctor-response">
                                                <div className="doc-meta">
                                                    <strong>Dr. Response</strong> ({new Date(item.respondedAt).toLocaleTimeString()}):
                                                </div>
                                                <p className="response-text">{item.responseText}</p>
                                            </div>
                                        ) : (
                                            <div className="thread-reply-box">
                                                {isRespondingThis ? (
                                                    <div className="reply-form">
                                                        <textarea
                                                            className="ipd-textarea"
                                                            placeholder="Type doctor's instructions or dosage clarification..."
                                                            value={doctorResponseText}
                                                            onChange={(e) => setDoctorResponseText(e.target.value)}
                                                            rows={3}
                                                        />
                                                        <div className="reply-actions">
                                                            <button
                                                                type="button"
                                                                className="btn-cancel-reply"
                                                                onClick={() => {
                                                                    setActiveClarificationId(null);
                                                                    setDoctorResponseText('');
                                                                }}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-submit-reply"
                                                                onClick={() => handleClarificationSubmit(item.orderId, item.clarificationId)}
                                                                disabled={submittingResponse || !doctorResponseText.trim()}
                                                            >
                                                                <FiSend />
                                                                <span>{submittingResponse ? 'Sending...' : 'Send Doctor Response'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="btn-open-reply"
                                                        onClick={() => {
                                                            setActiveClarificationId(item.clarificationId);
                                                            setDoctorResponseText('');
                                                        }}
                                                    >
                                                        <FiMessageSquare />
                                                        <span>Provide Instruction</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB: NURSING CLINICAL NOTES & OBSERVATIONS ── */}
            {activeTab === 'notes' && (
                <div className="ipd-notes-panel">
                    <div className="clar-header-row">
                        <div>
                            <h4>Nursing Clinical Notes & Observations</h4>
                            <p>Shift assessments, bedside vital alerts, wound checks, and clinical notes recorded by nursing staff</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                                type="button"
                                className="ipd-btn-refresh-sm"
                                onClick={fetchNursingNotes}
                                disabled={loadingNotes}
                            >
                                <FiRefreshCw className={loadingNotes ? 'spin' : ''} />
                                <span>Refresh</span>
                            </button>
                        </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="ipd-notes-filters">
                        <div className="filter-group">
                            <label>Category:</label>
                            <select
                                value={notesFilterCategory}
                                onChange={(e) => setNotesFilterCategory(e.target.value)}
                                className="ipd-select-sm"
                            >
                                <option value="ALL">All Categories</option>
                                <option value="GENERAL">General Care</option>
                                <option value="HANDOVER">Shift Handover</option>
                                <option value="OBSERVATION">Clinical Observation</option>
                                <option value="VITALS_ALERT">Vitals Alert</option>
                                <option value="WOUND_CARE">Wound Care</option>
                                <option value="MEDICATION">Medication Reaction</option>
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Shift:</label>
                            <select
                                value={notesFilterShift}
                                onChange={(e) => setNotesFilterShift(e.target.value)}
                                className="ipd-select-sm"
                            >
                                <option value="ALL">All Shifts</option>
                                <option value="Morning">Morning Shift</option>
                                <option value="Evening">Evening Shift</option>
                                <option value="Night">Night Shift</option>
                            </select>
                        </div>

                        <div className="filter-group">
                            <label>Priority:</label>
                            <select
                                value={notesFilterPriority}
                                onChange={(e) => setNotesFilterPriority(e.target.value)}
                                className="ipd-select-sm"
                            >
                                <option value="ALL">All Priorities</option>
                                <option value="Normal">Normal</option>
                                <option value="Urgent">Urgent</option>
                                <option value="Critical">Critical</option>
                            </select>
                        </div>

                        <div className="filter-count">
                            Showing <strong>{filteredNotes.length}</strong> of {nursingNotes.length} notes
                        </div>
                    </div>

                    {!activeAdmission ? (
                        <div className="ipd-empty-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>📝</span>
                            <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 700 }}>Patient Not Hospitalized</h4>
                            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.9rem' }}>Nursing shift notes and assessments will be recorded once the patient is admitted.</p>
                            <button type="button" onClick={handleOpenHospitalizeModal} className="ipd-btn-hospitalize-now" style={{ margin: '0 auto', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <FiPlus /> Hospitalize / Admit Patient
                            </button>
                        </div>
                    ) : loadingNotes ? (
                        <div className="ipd-loading-state">Loading nursing clinical notes...</div>
                    ) : filteredNotes.length === 0 ? (
                        <div className="ipd-empty-state">
                            <FiMessageSquare style={{ fontSize: '2.2rem', color: '#94a3b8', marginBottom: '8px' }} />
                            <div>{nursingNotes.length === 0 ? 'No clinical notes recorded yet by nursing staff for this patient admission.' : 'No notes match the selected filters.'}</div>
                        </div>
                    ) : (
                        <div className="ipd-notes-feed">
                            {filteredNotes.map((noteItem, idx) => {
                                const nurseObj = typeof noteItem.nurseId === 'object' ? noteItem.nurseId : null;
                                const nurseName = nurseObj?.name || (typeof noteItem.nurseId === 'string' && noteItem.nurseId.length < 20 ? noteItem.nurseId : 'Staff Nurse');
                                const nurseInitials = nurseName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'RN';
                                const priorityVal = String(noteItem.priority || 'Normal').toLowerCase();
                                const isUrgent = priorityVal === 'urgent' || priorityVal === 'critical';

                                return (
                                    <div key={noteItem._id || idx} className={`ipd-note-card ${isUrgent ? 'urgent' : ''}`}>
                                        <div className="note-card-left">
                                            <div className="nurse-avatar">{nurseInitials}</div>
                                        </div>
                                        <div className="note-card-body">
                                            <div className="note-card-header">
                                                <div className="nurse-info">
                                                    <span className="nurse-name">{nurseName}</span>
                                                    <span className="note-timestamp">
                                                        {new Date(noteItem.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {new Date(noteItem.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                    </span>
                                                </div>
                                                <div className="note-tags">
                                                    <span className="badge-category">{noteItem.noteType || 'GENERAL'}</span>
                                                    <span className="badge-shift">{noteItem.shift || 'Morning'}</span>
                                                    {isUrgent && (
                                                        <span className="badge-priority-urgent">{noteItem.priority || 'URGENT'}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="note-content-text">
                                                {noteItem.note}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── TAB 4: STRUCTURED DISCHARGE SUMMARY ── */}
            {activeTab === 'discharge' && (
                <div className="ipd-discharge-panel">
                    <div className="discharge-header-row">
                        <div>
                            <h4>Structured Inpatient Discharge Summary</h4>
                            <p>Official medical documentation of hospitalization course, take-home prescriptions, and clinical exit sign-off</p>
                        </div>
                        <div className="discharge-header-actions">
                            <button
                                type="button"
                                className="btn-print-summary"
                                onClick={handlePrintSummary}
                                disabled={!activeAdmission}
                            >
                                <FiPrinter />
                                <span>Print Summary</span>
                            </button>
                        </div>
                    </div>

                    {!activeAdmission ? (
                        <div className="ipd-empty-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
                            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '10px' }}>📄</span>
                            <h4 style={{ margin: '0 0 6px', color: '#0f172a', fontWeight: 700 }}>Patient Not Hospitalized</h4>
                            <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.9rem' }}>Structured discharge summaries are generated for admitted inpatients.</p>
                            <button type="button" onClick={handleOpenHospitalizeModal} className="ipd-btn-hospitalize-now" style={{ margin: '0 auto', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 18px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <FiPlus /> Hospitalize / Admit Patient
                            </button>
                        </div>
                    ) : loadingSummary ? (
                        <div className="ipd-loading-state">Loading discharge documentation...</div>
                    ) : (
                        <div className="discharge-form-container">
                            {summaryDoctorSigned && (
                                <div className="signed-notice-banner">
                                    <FiCheckCircle className="signed-icon" />
                                    <div>
                                        <strong>Discharge Summary Finalized & Signed</strong>
                                        <p>This document has been clinically approved. Clinical discharge order is active.</p>
                                    </div>
                                </div>
                            )}

                            {/* Section A: Clinical Course */}
                            <div className="ipd-section">
                                <h4 className="ipd-section-title">🏥 Clinical Course & Diagnoses</h4>
                                <div className="ipd-form-grid-2">
                                    <div className="ipd-field-group">
                                        <label>Final Discharge Diagnosis <span className="req">*</span></label>
                                        <input
                                            type="text"
                                            className="ipd-input"
                                            placeholder="e.g. Acute Calculous Cholecystitis (Post-Choly)"
                                            value={dischargeSummary.diagnosis}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, diagnosis: e.target.value }))}
                                        />
                                    </div>

                                    <div className="ipd-field-group">
                                        <label>Condition at Discharge</label>
                                        <select
                                            className="ipd-select"
                                            value={dischargeSummary.conditionAtDischarge}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, conditionAtDischarge: e.target.value }))}
                                        >
                                            {DISCHARGE_CONDITIONS.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="ipd-form-grid-2" style={{ marginTop: '12px' }}>
                                    <div className="ipd-field-group">
                                        <label>Admission Reason / Chief Complaints</label>
                                        <textarea
                                            className="ipd-textarea"
                                            placeholder="Symptoms at presentation..."
                                            value={dischargeSummary.admissionReason}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, admissionReason: e.target.value }))}
                                            rows={2}
                                        />
                                    </div>

                                    <div className="ipd-field-group">
                                        <label>Hospital Course & Summary of Treatment</label>
                                        <textarea
                                            className="ipd-textarea"
                                            placeholder="Detailed description of clinical course, response to therapy..."
                                            value={dischargeSummary.hospitalCourse}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, hospitalCourse: e.target.value }))}
                                            rows={2}
                                        />
                                    </div>
                                </div>

                                <div className="ipd-form-grid-2" style={{ marginTop: '12px' }}>
                                    <div className="ipd-field-group">
                                        <label>Procedures / Surgeries Performed</label>
                                        <textarea
                                            className="ipd-textarea"
                                            placeholder="Operative notes summary, anesthesia, dates..."
                                            value={dischargeSummary.proceduresSummary}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, proceduresSummary: e.target.value }))}
                                            rows={2}
                                        />
                                    </div>

                                    <div className="ipd-field-group">
                                        <label>Key Investigation Findings</label>
                                        <textarea
                                            className="ipd-textarea"
                                            placeholder="Significant Labs, USG, CT, ECG results..."
                                            value={dischargeSummary.keyInvestigationsSummary}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, keyInvestigationsSummary: e.target.value }))}
                                            rows={2}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section B: Take-Home Discharge Medications */}
                            <div className="ipd-section">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <h4 className="ipd-section-title" style={{ margin: 0 }}>
                                        💊 Take-Home Discharge Medications
                                    </h4>
                                    <button
                                        type="button"
                                        className="ipd-btn-add-row-sm"
                                        onClick={addDischargeMed}
                                    >
                                        <FiPlus /> Add Take-Home Med
                                    </button>
                                </div>

                                {dischargeSummary.dischargeMedications.map((med, idx) => (
                                    <div key={idx} className="discharge-med-row">
                                        <div className="dmed-grid">
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="Medicine Name (e.g. Tab. Cefixime 200mg)"
                                                value={med.medicineName}
                                                onChange={(e) => handleDischargeMedChange(idx, 'medicineName', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="Dosage (e.g. 1 tab)"
                                                value={med.dosage}
                                                onChange={(e) => handleDischargeMedChange(idx, 'dosage', e.target.value)}
                                            />
                                            <select
                                                className="ipd-select"
                                                value={med.frequency}
                                                onChange={(e) => handleDischargeMedChange(idx, 'frequency', e.target.value)}
                                            >
                                                {COMMON_FREQUENCIES.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="Duration (e.g. 5 days)"
                                                value={med.duration}
                                                onChange={(e) => handleDischargeMedChange(idx, 'duration', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="Instructions (e.g. After meals)"
                                                value={med.instructions}
                                                onChange={(e) => handleDischargeMedChange(idx, 'instructions', e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                className="ipd-btn-remove"
                                                onClick={() => removeDischargeMed(idx)}
                                            >
                                                <FiTrash2 />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Section C: Follow-up & Red Flags */}
                            <div className="ipd-section">
                                <h4 className="ipd-section-title">📅 Follow-Up & Emergency Return Precautions</h4>
                                <div className="ipd-form-grid-2 ipd-discharge-followup-grid">
                                    <div className="ipd-field-group">
                                        <label>Follow-Up Review Date</label>
                                        <input
                                            type="date"
                                            className="ipd-input"
                                            value={dischargeSummary.followUpDate}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, followUpDate: e.target.value }))}
                                        />
                                    </div>

                                    <div className="ipd-field-group">
                                        <label>Follow-Up & Dietary Instructions</label>
                                        <textarea
                                            rows={2}
                                            className="ipd-textarea ipd-followup-instructions-input"
                                            placeholder="e.g. Suture removal after 7 days, low salt diet"
                                            value={dischargeSummary.followUpInstructions}
                                            onChange={(e) => setDischargeSummary(p => ({ ...p, followUpInstructions: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="ipd-field-group" style={{ marginTop: '12px' }}>
                                    <label>Emergency Red-Flag Warnings / Return Precautions</label>
                                    <textarea
                                        className="ipd-textarea"
                                        value={dischargeSummary.returnPrecautions}
                                        onChange={(e) => setDischargeSummary(p => ({ ...p, returnPrecautions: e.target.value }))}
                                        rows={2}
                                    />
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="discharge-actions-footer">
                                <button
                                    type="button"
                                    className="btn-save-draft"
                                    onClick={() => handleSaveDischargeSummary('DRAFT')}
                                    disabled={savingSummary}
                                >
                                    <FiSave />
                                    <span>{savingSummary ? 'Saving...' : 'Save Draft'}</span>
                                </button>

                                <button
                                    type="button"
                                    className="btn-finalize-sign"
                                    onClick={() => handleSaveDischargeSummary('FINALIZED')}
                                    disabled={savingSummary}
                                >
                                    <FiUserCheck />
                                    <span>{savingSummary ? 'Signing...' : '✓ Finalize & Sign Discharge Summary'}</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* CANCEL CONFIRMATION MODAL */}
            {orderToCancel && (
                <div className="ipd-modal-backdrop">
                    <div className="ipd-modal-box">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                            <span style={{ fontSize: '1.8rem', color: '#dc2626' }}>⚠️</span>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                                Cancel Clinical Order?
                            </h3>
                        </div>

                        <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                            Are you sure you want to cancel the order for <strong>{orderToCancel.medicineName}</strong> ({orderToCancel.dosage?.value} {orderToCancel.dosage?.unit})?
                        </p>

                        <div className="audit-notice-box">
                            ℹ️ <strong>Clinical Audit Notice:</strong> This order will not be deleted from the database. Its status will be updated to <strong>CANCELLED</strong> in the permanent audit trail. Any doses already administered in the MAR remain recorded.
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setOrderToCancel(null)}
                                disabled={cancelling}
                                className="btn-modal-cancel"
                            >
                                Keep Order
                            </button>
                            <button
                                type="button"
                                onClick={confirmCancelOrder}
                                disabled={cancelling}
                                className="btn-modal-confirm"
                            >
                                {cancelling ? 'Cancelling...' : 'Confirm Cancel Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* HOSPITALIZE / ADMIT PATIENT MODAL */}
            {hospitalizeModalOpen && (
                <div className="ipd-modal-backdrop">
                    <div className="ipd-modal-box" style={{ maxWidth: '540px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.6rem' }}>🏥</span>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 800 }}>
                                    Hospitalize / Admit Patient
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setHospitalizeModalOpen(false)}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
                            >
                                <FiX size={20} />
                            </button>
                        </div>

                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                            Patient: <strong>{patientName}</strong> (MRN: {patientMRN}) &nbsp;|&nbsp; Doctor: <strong>Dr. {activeDoctor?.name || 'Attending'}</strong>
                        </div>

                        <form onSubmit={handleHospitalizePatient}>
                            {loadingBeds ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                                    <FiRefreshCw className="spin" style={{ marginRight: '8px' }} /> Loading available hospital beds...
                                </div>
                            ) : availableBeds.length === 0 ? (
                                <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem', marginBottom: '16px' }}>
                                    ⚠️ No available beds found in this hospital. Please create or vacate beds in Bed Management first.
                                </div>
                            ) : (
                                <>
                                    <div className="ipd-form-grid-2" style={{ marginBottom: '14px' }}>
                                        <div className="ipd-field-group">
                                            <label>Select Ward <span className="req">*</span></label>
                                            <select
                                                className="ipd-select"
                                                value={hospitalizeForm.ward}
                                                onChange={(e) => {
                                                    const w = e.target.value;
                                                    const matchBed = availableBeds.find(b => b.ward.toLowerCase() === w.toLowerCase());
                                                    setHospitalizeForm(prev => ({
                                                        ...prev,
                                                        ward: w,
                                                        bedId: matchBed ? matchBed._id : ''
                                                    }));
                                                }}
                                                required
                                            >
                                                <option value="">-- Choose Ward --</option>
                                                {[...new Set(availableBeds.map(b => b.ward))].map(w => (
                                                    <option key={w} value={w}>{w}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Select Available Bed <span className="req">*</span></label>
                                            <select
                                                className="ipd-select"
                                                value={hospitalizeForm.bedId}
                                                onChange={(e) => setHospitalizeForm(prev => ({ ...prev, bedId: e.target.value }))}
                                                required
                                            >
                                                <option value="">-- Choose Bed --</option>
                                                {availableBeds
                                                    .filter(b => !hospitalizeForm.ward || b.ward.toLowerCase() === hospitalizeForm.ward.toLowerCase())
                                                    .map(b => (
                                                        <option key={b._id} value={b._id}>
                                                            Bed {b.bedNumber} ({b.bedType || 'General'})
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                    </div>

                                    <div className="ipd-form-grid-2" style={{ marginBottom: '14px' }}>
                                        <div className="ipd-field-group">
                                            <label>Admission Date <span className="req">*</span></label>
                                            <input
                                                type="date"
                                                className="ipd-input"
                                                value={hospitalizeForm.admissionDate}
                                                onChange={(e) => setHospitalizeForm(prev => ({ ...prev, admissionDate: e.target.value }))}
                                                required
                                            />
                                        </div>

                                        <div className="ipd-field-group">
                                            <label>Admission Time <span className="req">*</span></label>
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="e.g. 10:30 AM"
                                                value={hospitalizeForm.admissionTime}
                                                onChange={(e) => setHospitalizeForm(prev => ({ ...prev, admissionTime: e.target.value }))}
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="ipd-field-group" style={{ marginBottom: '18px' }}>
                                        <label>Admission Indication / Clinical Reason</label>
                                        <textarea
                                            className="ipd-textarea"
                                            rows={2}
                                            placeholder="e.g. Inpatient monitoring and IV therapy"
                                            value={hospitalizeForm.notes}
                                            onChange={(e) => setHospitalizeForm(prev => ({ ...prev, notes: e.target.value }))}
                                        />
                                    </div>
                                </>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                                <button
                                    type="button"
                                    onClick={() => setHospitalizeModalOpen(false)}
                                    className="btn-modal-cancel"
                                    disabled={hospitalizeSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn-finalize-sign"
                                    disabled={hospitalizeSaving || availableBeds.length === 0 || !hospitalizeForm.ward || !hospitalizeForm.bedId}
                                    style={{ margin: 0 }}
                                >
                                    {hospitalizeSaving ? 'Hospitalizing...' : '✓ Confirm & Hospitalize Patient'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <TPRChartModal
                isOpen={tprModalOpen}
                onClose={() => setTprModalOpen(false)}
                admissionId={activeAdmission?._id || admissionId || propAdmission?._id}
                admission={activeAdmission || propAdmission}
                patient={patient || activeAdmission?.patientId}
            />

            <InpatientClinicalNotesModal
                isOpen={clinicalNotesModalOpen}
                onClose={() => setClinicalNotesModalOpen(false)}
                admissionId={activeAdmission?._id || admissionId || propAdmission?._id}
                admission={activeAdmission || propAdmission}
                patient={patient || activeAdmission?.patientId}
            />

            <IPDClinicalChartsModal
                isOpen={clinicalChartsModal.open}
                onClose={() => setClinicalChartsModal(prev => ({ ...prev, open: false }))}
                admissionId={activeAdmission?._id || admissionId || propAdmission?._id}
                admission={activeAdmission || propAdmission}
                patient={patient || activeAdmission?.patientId}
                initialTab={clinicalChartsModal.tab}
            />

            {/* ── Official 2-Page ICU Daily Observation Chart Modal ── */}
            <ICUChartModal
                isOpen={icuChartModalOpen}
                onClose={() => setIcuChartModalOpen(false)}
                admissionId={activeAdmission?._id || admissionId || propAdmission?._id}
                admission={activeAdmission || propAdmission}
                patient={patient || activeAdmission?.patientId}
            />
        </div>
    );
};

export default DoctorIPDOrdersPanel;
