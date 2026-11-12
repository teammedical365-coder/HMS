import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    FiDroplet
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import './IPDClinicalChartsModal.css';

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
    initialTab = 'progress_notes', // 'progress_notes' | 'drug_stat_iv' | 'drug_mar'
    isBlank = false
}) => {
    const { user } = useAuth();
    const { branding, hospitalName: brandingHospitalName } = useBranding();

    const [activeTab, setActiveTab] = useState(initialTab);
    const [viewMode, setViewMode] = useState(isBlank ? 'preview' : 'workspace'); // 'workspace' | 'preview'
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const [admission, setAdmission] = useState(initialAdmission || null);
    const [tenantHospital, setTenantHospital] = useState(null);

    // Progress Notes State
    const [progressNotes, setProgressNotes] = useState([]);
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

    const effectiveAdmissionId = admissionId || initialAdmission?._id || null;

    // Derive Role Flags accurately from user object
    const sanitizedRole = useMemo(() => {
        const raw = user?._roleData?.name || user?.role || '';
        return String(raw).toLowerCase().replace(/\s+/g, '');
    }, [user]);

    const userPerms = useMemo(() => user?._roleData?.permissions || [], [user]);
    const isDoctorOrAdmin = useMemo(() => (
        ['doctor', 'clinicdoctor', 'surgeon', 'consultant', 'physician', 'doctorassistant', 'assistant', 'clinicalassistant', 'hospitaladmin', 'centraladmin', 'superadmin', 'admin'].includes(sanitizedRole) ||
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
            setActiveTab(initialTab || 'progress_notes');
            setViewMode(isBlank ? 'preview' : 'workspace');
            setNewProgressForm({ recordedAt: toDateTimeLocalValue(), sheetNo: '1', note: '' });
            setStatForm(prev => ({
                ...prev,
                date: todayDateDisplay(),
                time: nowTime12h(),
                doctorName: user?.name ? (isDoctorOrAdmin ? `Dr. ${user.name.replace(/^dr\.?\s*/i, '')}` : '') : ''
            }));
            setIvForm(prev => ({
                ...prev,
                date: todayDateDisplay(),
                timeStart: nowTime12h(),
                doctorName: user?.name ? (isDoctorOrAdmin ? `Dr. ${user.name.replace(/^dr\.?\s*/i, '')}` : '') : ''
            }));
        }
    }, [isOpen, initialTab, isBlank, user?.name, isDoctorOrAdmin]);

    const loadAllData = useCallback(async () => {
        if (!isOpen) return;
        setLoading(true);
        try {
            const brandingPromise = user?.hospitalId
                ? hospitalAPI.getMyBranding().catch(() => null)
                : Promise.resolve(null);

            if (!effectiveAdmissionId || isBlank) {
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

    const combinedStatRows = useMemo(() => buildCombinedStatRows(drugChart, orders), [drugChart, orders]);
    const combinedIvRows = useMemo(() => buildCombinedIVFluidRows(drugChart, orders), [drugChart, orders]);

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
            if (activeTab === 'progress_notes') {
                await downloadProgressNotesPdf({
                    hospital: hospitalObj,
                    patient: initialPatient || admission?.patientId,
                    admission,
                    progressNotes,
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
        if (activeTab === 'progress_notes') {
            printProgressNotes({
                hospital: hospitalObj,
                patient: initialPatient || admission?.patientId,
                admission,
                progressNotes,
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
                isBlank
            });
        }
    };

    if (!isOpen) return null;

    const progressPages = isBlank
        ? paginateProgressNotes([], PROGRESS_ROWS_PER_PAGE)
        : paginateProgressNotes(progressNotes, PROGRESS_ROWS_PER_PAGE);

    const isAccredited = hospitalObj.accreditation?.enabled === true;
    const rawCert = isAccredited && hospitalObj.accreditation?.certNo ? String(hospitalObj.accreditation.certNo).trim() : '';
    const certText = rawCert ? (/^cert\.?\s*no/i.test(rawCert) ? rawCert : `Cert. No. : ${rawCert}`) : '';
    const hospLogoUrl = hospitalObj.logoUrl || hospitalObj.logo || '';
    const hospName = hospitalObj.name || hospitalObj.appName || 'Hospital';

    const renderPatientStrip = () => (
        <div className="ipdc-banner">
            <span>Patient Name : {ptDetails.name}</span>
            <span className="ipdc-sep">|</span>
            <span>UHID : {ptDetails.uhid}</span>
            <span className="ipdc-sep">|</span>
            <span>IPD : {ptDetails.ipdNumber}</span>
            <span className="ipdc-sep">|</span>
            <span>Gender : {ptDetails.gender}</span>
            <span className="ipdc-sep">|</span>
            <span>Age : {ptDetails.age}</span>
        </div>
    );

    const renderDrugPage2PatientStrip = () => {
        const totalChars =
            String(ptDetails.name || '').length +
            String(ptDetails.uhid || '').length +
            String(ptDetails.ipdNumber || '').length +
            String(ptDetails.gender || '').length +
            String(ptDetails.age || '').length;
        const dynamicFontPx = totalChars > 72 ? 10 : totalChars > 56 ? 11 : 12.2;
        return (
            <div className="ipdc-banner dc-p2-banner" style={{ fontSize: `${dynamicFontPx}px` }}>
                <span>Patient Name : {ptDetails.name}</span>
                <span>UHID : {ptDetails.uhid}</span>
                <span>IPD : {ptDetails.ipdNumber}</span>
                <span>Gender : {ptDetails.gender}</span>
                <span>Age : {ptDetails.age}</span>
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

    return (
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
                        {!isBlank && (
                            <div className="ipdc-mode-switch">
                                <button
                                    type="button"
                                    className={`ipdc-mode-btn ${viewMode === 'workspace' ? 'active' : ''}`}
                                    onClick={() => setViewMode('workspace')}
                                >
                                    <FiEdit2 size={13} /> Edit Workspace
                                </button>
                                <button
                                    type="button"
                                    className={`ipdc-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
                                    onClick={() => setViewMode('preview')}
                                >
                                    <FiEye size={13} /> Exact A4 Preview
                                </button>
                            </div>
                        )}
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

                {/* ── Accessible Patient Summary Bar ── */}
                {!isBlank && (
                    <div className="ipdc-quick-pt-bar">
                        <span><strong>Patient:</strong> {ptDetails.name}</span>
                        <span><strong>UHID:</strong> {ptDetails.uhid}</span>
                        <span><strong>IPD:</strong> {ptDetails.ipdNumber}</span>
                        <span><strong>Age/Sex:</strong> {ptDetails.age} / {ptDetails.gender}</span>
                        <span><strong>DOA:</strong> {headerData.doa || '—'}</span>
                        <span><strong>Ward/Bed:</strong> {headerData.wardBed || '—'}</span>
                        <span><strong>Consultant:</strong> {headerData.consultant || '—'}</span>
                    </div>
                )}

                {/* ── 3 Required Clinical Tabs ── */}
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
                        className={`ipdc-tab ${activeTab === 'drug_stat_iv' ? 'active' : ''}`}
                        onClick={() => setActiveTab('drug_stat_iv')}
                    >
                        <FiDroplet size={14} />
                        <span>2. Drug Chart — STAT &amp; IV Fluids</span>
                    </button>
                    <button
                        type="button"
                        className={`ipdc-tab ${activeTab === 'drug_mar' ? 'active' : ''}`}
                        onClick={() => setActiveTab('drug_mar')}
                    >
                        <FiShield size={14} />
                        <span>3. Drug Chart — Medication Administration ({marOrders.length})</span>
                    </button>
                </div>

                {/* ── Main Content Body ── */}
                <div className="ipdc-body">
                    {loading && <div className="ipdc-loading">Loading clinical chart records…</div>}

                    {/* =========================================================
                        TAB 1: PROGRESS NOTES (WORKSPACE OR EXACT PDF PREVIEW)
                       ========================================================= */}
                    {!loading && activeTab === 'progress_notes' && viewMode === 'workspace' && !isBlank && (
                        <div className="ipdc-workspace-grid">
                            <div className="ipdc-card">
                                <div className="ipdc-card-header">
                                    <h4><FiPlus /> Add Clinical Progress Note</h4>
                                    <span className="ipdc-pill">Sheet No. {progressPages.length}</span>
                                </div>
                                <form onSubmit={handleAddProgressNote} className="ipdc-form">
                                    <div className="ipdc-form-row-2">
                                        <div className="ipdc-field">
                                            <label>Date &amp; Time *</label>
                                            <input
                                                type="datetime-local"
                                                value={newProgressForm.recordedAt}
                                                onChange={(e) => setNewProgressForm(p => ({ ...p, recordedAt: e.target.value }))}
                                                required
                                            />
                                        </div>
                                        <div className="ipdc-field">
                                            <label>Sheet No.</label>
                                            <input
                                                type="text"
                                                value={newProgressForm.sheetNo}
                                                onChange={(e) => setNewProgressForm(p => ({ ...p, sheetNo: e.target.value }))}
                                                placeholder="1"
                                            />
                                        </div>
                                    </div>
                                    <div className="ipdc-field">
                                        <label>Clinical Progress Observation *</label>
                                        <textarea
                                            rows={4}
                                            value={newProgressForm.note}
                                            onChange={(e) => setNewProgressForm(p => ({ ...p, note: e.target.value }))}
                                            placeholder="Record patient clinical status, physical examination findings, response to therapy, vitals review, and next clinical plan..."
                                            required
                                        />
                                    </div>
                                    <div className="ipdc-form-actions">
                                        <button type="submit" className="ipdc-btn-primary" disabled={savingProgress || !newProgressForm.note.trim()}>
                                            <FiSave size={14} /> <span>{savingProgress ? 'Saving…' : 'Save Progress Note'}</span>
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <div className="ipdc-card">
                                <div className="ipdc-card-header">
                                    <h4><FiClock /> Chronological Clinical Progress History ({progressNotes.length})</h4>
                                </div>
                                {progressNotes.length === 0 ? (
                                    <div className="ipdc-empty">No progress notes recorded yet for this admission.</div>
                                ) : (
                                    <div className="ipdc-table-scroll">
                                        <table className="ipdc-data-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '150px' }}>Date &amp; Time</th>
                                                    <th>Clinical Progress Notes</th>
                                                    <th style={{ width: '90px' }}>Sheet</th>
                                                    <th style={{ width: '190px' }}>Author &amp; Audit</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {progressNotes.map((entry) => {
                                                    const edits = Array.isArray(entry.editHistory) ? entry.editHistory : [];
                                                    const isHistOpen = Boolean(expandedProgressHistory[entry._id]);
                                                    return (
                                                        <tr key={entry._id}>
                                                            <td>
                                                                <div className="dt-main">{formatDateDisplay(entry.recordedAt)}</div>
                                                                <div className="dt-sub">{new Date(entry.recordedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
                                                            </td>
                                                            <td>
                                                                <div className="note-body">{entry.note}</div>
                                                                {edits.length > 0 && (
                                                                    <div className="audit-links">
                                                                        <button
                                                                            type="button"
                                                                            className="ipdc-link-btn"
                                                                            onClick={() => setExpandedProgressHistory(prev => ({ ...prev, [entry._id]: !prev[entry._id] }))}
                                                                        >
                                                                            <FiClock size={12} /> {isHistOpen ? 'Hide' : 'View'} Edit History ({edits.length})
                                                                        </button>
                                                                        {isHistOpen && (
                                                                            <div className="audit-box">
                                                                                {edits.map((ed, idx) => (
                                                                                    <div key={ed._id || idx} className="audit-item">
                                                                                        <div className="audit-meta">
                                                                                            <strong>{ed.editedByName}</strong> ({ed.editedByRole || 'Staff'}) • {new Date(ed.editedAt).toLocaleString('en-IN')}
                                                                                            {ed.editReason && <span> • Reason: <em>{ed.editReason}</em></span>}
                                                                                        </div>
                                                                                        <div className="audit-prev">Previous Note: &ldquo;{ed.previousNote}&rdquo;</div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="c">{entry.sheetNo || '1'}</td>
                                                            <td>
                                                                <div className="author-info">
                                                                    <strong>{entry.authorName}</strong>
                                                                    <span>{entry.authorRole}</span>
                                                                    <small>Created: {new Date(entry.createdAt).toLocaleString('en-IN')}</small>
                                                                    {edits.length > 0 && (
                                                                        <small className="edited-tag">Edited by {entry.updatedByName} ({new Date(entry.updatedAt).toLocaleString('en-IN')})</small>
                                                                    )}
                                                                </div>
                                                                {canEditProgressEntry(entry) && (
                                                                    <button
                                                                        type="button"
                                                                        className="ipdc-mini-btn"
                                                                        onClick={() => setEditingProgress({
                                                                            _id: entry._id,
                                                                            recordedAt: toDateTimeLocalValue(entry.recordedAt),
                                                                            sheetNo: entry.sheetNo || '1',
                                                                            note: entry.note,
                                                                            editReason: ''
                                                                        })}
                                                                    >
                                                                        <FiEdit2 size={12} /> Edit
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

                    {!loading && activeTab === 'progress_notes' && (viewMode === 'preview' || isBlank) && (
                        <div className="ipdc-sheets-stack">
                            {progressPages.map((pg, idx) => (
                                <div key={idx} className="ipdc-a4-sheet">
                                    {renderPatientStrip()}
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
                                            {pg.rows.map((r, rIdx) => (
                                                <tr key={rIdx}>
                                                    <td className="pn-col-dt">{isBlank ? '' : r.dateTimeText}</td>
                                                    <td className={r.isMeta ? 'pn-meta-cell' : ''}>{isBlank ? '' : r.noteText}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="pn-exact-footer">Progress Sheet Cond ......</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* =========================================================
                        TAB 2: DRUG CHART — ALLERGY, STAT & IV FLUIDS
                       ========================================================= */}
                    {!loading && activeTab === 'drug_stat_iv' && viewMode === 'workspace' && !isBlank && (
                        <div className="ipdc-workspace-grid">
                            {/* Section A: DRUG ALLERGY */}
                            <div className="ipdc-card">
                                <div className="ipdc-card-header">
                                    <h4><FiAlertTriangle color="#b91c1c" /> Section A — Drug Allergy &amp; Sheet Number</h4>
                                    {existingAllergies.combinedSuggestions?.length > 0 && (
                                        <span className="ipdc-allergy-hint">
                                            Known Record: <strong>{existingAllergies.combinedSuggestions.join(', ')}</strong>
                                        </span>
                                    )}
                                </div>
                                <form onSubmit={handleSaveAllergy} className="ipdc-allergy-form">
                                    <div className="ipdc-field">
                                        <label>1. Drug Allergy</label>
                                        <input
                                            type="text"
                                            value={allergyForm.slot1}
                                            onChange={(e) => setAllergyForm(p => ({ ...p, slot1: e.target.value }))}
                                            placeholder={existingAllergies.combinedSuggestions?.[0] || 'e.g. Penicillin / NKDA'}
                                        />
                                    </div>
                                    <div className="ipdc-field">
                                        <label>2. Drug Allergy</label>
                                        <input
                                            type="text"
                                            value={allergyForm.slot2}
                                            onChange={(e) => setAllergyForm(p => ({ ...p, slot2: e.target.value }))}
                                            placeholder={existingAllergies.combinedSuggestions?.[1] || 'e.g. Sulfa drugs (if applicable)'}
                                        />
                                    </div>
                                    <div className="ipdc-field sm">
                                        <label>Sheet No.</label>
                                        <input
                                            type="text"
                                            value={allergyForm.sheetNo}
                                            onChange={(e) => setAllergyForm(p => ({ ...p, sheetNo: e.target.value }))}
                                        />
                                    </div>
                                    <div className="ipdc-allergy-btns">
                                        {existingAllergies.combinedSuggestions?.length > 0 && !allergyForm.slot1 && (
                                            <button
                                                type="button"
                                                className="ipdc-btn-outline"
                                                onClick={() => setAllergyForm(p => ({
                                                    ...p,
                                                    slot1: existingAllergies.combinedSuggestions[0] || '',
                                                    slot2: existingAllergies.combinedSuggestions[1] || ''
                                                }))}
                                            >
                                                Fill From Record
                                            </button>
                                        )}
                                        <button type="submit" className="ipdc-btn-primary" disabled={savingAllergy}>
                                            <FiSave size={14} /> <span>{savingAllergy ? 'Saving…' : 'Save Allergies'}</span>
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Section B: ONCE-ONLY PRESCRIPTION (STAT-DOSES) */}
                            <div className="ipdc-card">
                                <div className="ipdc-card-header">
                                    <h4><FiFileText /> Section B — ONCE-ONLY PRESCRIPTION (STAT-DOSES)</h4>
                                    {isDoctorOrAdmin && (
                                        <button
                                            type="button"
                                            className="ipdc-btn-primary"
                                            onClick={() => setShowStatForm(s => !s)}
                                        >
                                            <FiPlus size={14} /> <span>{showStatForm ? 'Close Form' : 'Add STAT Order'}</span>
                                        </button>
                                    )}
                                </div>

                                {showStatForm && isDoctorOrAdmin && (
                                    <form onSubmit={handleAddStatDose} className="ipdc-subform">
                                        <div className="ipdc-grid-4">
                                            <div className="ipdc-field">
                                                <label>Date *</label>
                                                <input type="text" value={statForm.date} onChange={(e) => setStatForm(p => ({ ...p, date: e.target.value }))} required />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Drug Name *</label>
                                                <input type="text" placeholder="e.g. Inj. Ondansetron" value={statForm.drugName} onChange={(e) => setStatForm(p => ({ ...p, drugName: e.target.value }))} required />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Dose</label>
                                                <input type="text" placeholder="e.g. 4 mg" value={statForm.dose} onChange={(e) => setStatForm(p => ({ ...p, dose: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Route</label>
                                                <select value={statForm.route} onChange={(e) => setStatForm(p => ({ ...p, route: e.target.value }))}>
                                                    {ROUTES_LIST.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Time</label>
                                                <input type="text" value={statForm.time} onChange={(e) => setStatForm(p => ({ ...p, time: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Prescribing Doctor</label>
                                                <input type="text" value={statForm.doctorName} onChange={(e) => setStatForm(p => ({ ...p, doctorName: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field span-2">
                                                <label>Remarks / Indication</label>
                                                <input type="text" placeholder="Clinical indication or instructions" value={statForm.remarks} onChange={(e) => setStatForm(p => ({ ...p, remarks: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="ipdc-form-actions">
                                            <span className="safety-hint">New STAT orders start as <strong>Pending</strong>; Nursing staff confirm Given By separately.</span>
                                            <button type="submit" className="ipdc-btn-primary" disabled={savingStat}>
                                                <FiSave size={14} /> <span>{savingStat ? 'Prescribing…' : 'Save STAT Prescription'}</span>
                                            </button>
                                        </div>
                                    </form>
                                )}

                                <div className="ipdc-table-scroll">
                                    <table className="ipdc-data-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Drug</th>
                                                <th>Dose</th>
                                                <th>Route</th>
                                                <th>Time</th>
                                                <th>Doctor</th>
                                                <th>Given By</th>
                                                <th>Checked By</th>
                                                <th>Remarks / Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {combinedStatRows.length === 0 ? (
                                                <tr><td colSpan={10} className="ipdc-empty-cell">No STAT-dose orders recorded yet.</td></tr>
                                            ) : combinedStatRows.map((row) => (
                                                <tr key={row._id}>
                                                    <td className="c">{row.date}</td>
                                                    <td><strong>{row.drugName}</strong></td>
                                                    <td className="c">{row.dose || '—'}</td>
                                                    <td className="c">{row.route || '—'}</td>
                                                    <td className="c">{row.time || '—'}</td>
                                                    <td>{row.doctorName || '—'}</td>
                                                    <td>{row.givenByName || <span className="pending-txt">Pending Nurse</span>}</td>
                                                    <td>{row.checkedByName || '—'}</td>
                                                    <td>
                                                        <span className={`status-chip st-${(row.status || 'PENDING').toLowerCase()}`}>
                                                            {row.status === 'ADMINISTERED' ? 'Given' : row.status || 'Pending'}
                                                        </span>
                                                        {row.remarks && <div className="rem-txt">{row.remarks}</div>}
                                                    </td>
                                                    <td>
                                                        {!row.fromOrderOnly && (
                                                            <div className="row-actions">
                                                                {canNurseAdminister && row.status === 'PENDING' && (
                                                                    <button
                                                                        type="button"
                                                                        className="ipdc-mini-btn green"
                                                                        onClick={() => setStatActionModal({
                                                                            entry: row,
                                                                            mode: 'administer',
                                                                            form: {
                                                                                status: 'ADMINISTERED',
                                                                                givenByName: user?.name || '',
                                                                                checkedByName: row.checkedByName || '',
                                                                                remarks: row.remarks || '',
                                                                                editReason: ''
                                                                            }
                                                                        })}
                                                                    >
                                                                        <FiCheck size={12} /> Administer
                                                                    </button>
                                                                )}
                                                                {canNurseAdminister && row.status !== 'PENDING' && (
                                                                    <button
                                                                        type="button"
                                                                        className="ipdc-mini-btn"
                                                                        onClick={() => setStatActionModal({
                                                                            entry: row,
                                                                            mode: 'correct',
                                                                            form: {
                                                                                status: row.status,
                                                                                givenByName: row.givenByName || '',
                                                                                checkedByName: row.checkedByName || '',
                                                                                remarks: row.remarks || '',
                                                                                editReason: ''
                                                                            }
                                                                        })}
                                                                    >
                                                                        <FiEdit2 size={12} /> Correct
                                                                    </button>
                                                                )}
                                                                {!canNurseAdminister && isDoctorOrAdmin && (
                                                                    <button
                                                                        type="button"
                                                                        className="ipdc-mini-btn"
                                                                        onClick={() => setStatActionModal({
                                                                            entry: row,
                                                                            mode: 'edit',
                                                                            form: {
                                                                                date: row.date,
                                                                                time: row.time,
                                                                                drugName: row.drugName,
                                                                                dose: row.dose,
                                                                                route: row.route,
                                                                                doctorName: row.doctorName,
                                                                                checkedByName: row.checkedByName || user?.name || '',
                                                                                remarks: row.remarks || '',
                                                                                editReason: ''
                                                                            }
                                                                        })}
                                                                    >
                                                                        <FiEdit2 size={12} /> Verify/Edit
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Section C: I.V. FLUIDS */}
                            <div className="ipdc-card">
                                <div className="ipdc-card-header">
                                    <h4><FiDroplet /> Section C — I.V. FLUIDS</h4>
                                    <button
                                        type="button"
                                        className="ipdc-btn-primary"
                                        onClick={() => setShowIvForm(s => !s)}
                                    >
                                        <FiPlus size={14} /> <span>{showIvForm ? 'Close Form' : 'Add IV Fluid'}</span>
                                    </button>
                                </div>

                                {showIvForm && (
                                    <form onSubmit={handleAddIVFluid} className="ipdc-subform">
                                        <div className="ipdc-grid-4">
                                            <div className="ipdc-field">
                                                <label>Date *</label>
                                                <input type="text" value={ivForm.date} onChange={(e) => setIvForm(p => ({ ...p, date: e.target.value }))} required />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Fluid Name *</label>
                                                <input type="text" placeholder="e.g. Inj. Normal Saline (0.9%)" value={ivForm.fluidName} onChange={(e) => setIvForm(p => ({ ...p, fluidName: e.target.value }))} required />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Volume</label>
                                                <input type="text" placeholder="e.g. 500 ml" value={ivForm.volume} onChange={(e) => setIvForm(p => ({ ...p, volume: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Time Start</label>
                                                <input type="text" value={ivForm.timeStart} onChange={(e) => setIvForm(p => ({ ...p, timeStart: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Infusion Time (hrs.)</label>
                                                <input type="text" placeholder="e.g. 4 hrs" value={ivForm.infusionTimeHrs} onChange={(e) => setIvForm(p => ({ ...p, infusionTimeHrs: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field">
                                                <label>Doctor</label>
                                                <input type="text" value={ivForm.doctorName} onChange={(e) => setIvForm(p => ({ ...p, doctorName: e.target.value }))} />
                                            </div>
                                            <div className="ipdc-field span-2">
                                                <label>Remarks</label>
                                                <input type="text" placeholder="Rate or additive details" value={ivForm.remarks} onChange={(e) => setIvForm(p => ({ ...p, remarks: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="ipdc-form-actions">
                                            <button type="submit" className="ipdc-btn-primary" disabled={savingIv}>
                                                <FiSave size={14} /> <span>{savingIv ? 'Saving…' : 'Save IV Fluid Entry'}</span>
                                            </button>
                                        </div>
                                    </form>
                                )}

                                <div className="ipdc-table-scroll">
                                    <table className="ipdc-data-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Fluid</th>
                                                <th>Volume</th>
                                                <th>Time Start</th>
                                                <th>Infusion time (hrs.)</th>
                                                <th>Doctor</th>
                                                <th>Admin.by</th>
                                                <th>Remarks</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {combinedIvRows.length === 0 ? (
                                                <tr><td colSpan={9} className="ipdc-empty-cell">No IV fluid entries recorded yet.</td></tr>
                                            ) : combinedIvRows.map((row) => (
                                                <tr key={row._id}>
                                                    <td className="c">{row.date}</td>
                                                    <td><strong>{row.fluidName}</strong></td>
                                                    <td className="c">{row.volume || '—'}</td>
                                                    <td className="c">{row.timeStart || '—'}</td>
                                                    <td className="c">{row.infusionTimeHrs || '—'}</td>
                                                    <td>{row.doctorName || '—'}</td>
                                                    <td>{row.adminByName || <span className="pending-txt">Pending Nurse</span>}</td>
                                                    <td>{row.remarks || '—'}</td>
                                                    <td>
                                                        {!row.fromOrderOnly && (
                                                            <div className="row-actions">
                                                                {canNurseAdminister && (
                                                                    <button
                                                                        type="button"
                                                                        className="ipdc-mini-btn green"
                                                                        onClick={() => setIvActionModal({
                                                                            entry: row,
                                                                            mode: ['COMPLETED', 'HELD', 'NOT_GIVEN'].includes(row.status) ? 'edit' : 'administer',
                                                                            form: {
                                                                                status: row.status === 'PENDING' ? 'RUNNING' : row.status,
                                                                                adminByName: row.adminByName || user?.name || '',
                                                                                timeStart: row.timeStart || nowTime12h(),
                                                                                infusionTimeHrs: row.infusionTimeHrs || '',
                                                                                remarks: row.remarks || '',
                                                                                editReason: ''
                                                                            }
                                                                        })}
                                                                    >
                                                                        <FiCheck size={12} /> {row.adminByName ? 'Update Admin' : 'Confirm Admin'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* =========================================================
                        TAB 3: DRUG CHART — MEDICATION ADMINISTRATION GRID (PAGE 2)
                       ========================================================= */}
                    {!loading && activeTab === 'drug_mar' && viewMode === 'workspace' && !isBlank && (
                        <div className="ipdc-workspace-grid">
                            <div className="ipdc-card">
                                <div className="ipdc-card-header wrap">
                                    <div>
                                        <h4><FiShield /> Medication Administration Grid (06 AM · 10 AM · 02 PM · 10 PM)</h4>
                                        <span className="ipdc-muted-sub">
                                            {canNurseAdminister
                                                ? 'Tap any slot cell to record Given / Pending / Not Given / Refused / Held status, actual dose, and nurse initials.'
                                                : 'Doctor Read-Only Review: Only authorized nursing staff can confirm administration.'}
                                        </span>
                                    </div>
                                    <div className="ipdc-day-nav">
                                        <button
                                            type="button"
                                            className="ipdc-btn-outline sm"
                                            disabled={dayWindowIdx <= 0}
                                            onClick={() => setDayWindowIdx(i => Math.max(0, i - 1))}
                                        >
                                            <FiChevronLeft /> Prev 4 Days
                                        </button>
                                        <span className="day-range-lbl">
                                            {formatDateDisplay(activeFourDates[0])} – {formatDateDisplay(activeFourDates[3])}
                                        </span>
                                        <button
                                            type="button"
                                            className="ipdc-btn-outline sm"
                                            disabled={dayWindowIdx >= dateWindows.length - 1}
                                            onClick={() => setDayWindowIdx(i => Math.min(dateWindows.length - 1, i + 1))}
                                        >
                                            Next 4 Days <FiChevronRight />
                                        </button>
                                    </div>
                                </div>

                                {/* Visual Status Legend */}
                                <div className="mar-legend">
                                    <span className="lg-item lg-given">Given</span>
                                    <span className="lg-item lg-pending">Pending</span>
                                    <span className="lg-item lg-not-given">Not Given</span>
                                    <span className="lg-item lg-refused">Refused</span>
                                    <span className="lg-item lg-held">Held</span>
                                    <span className="lg-note">Prescribed dose stays read-only on left; actual administered dose &amp; time stored per cell.</span>
                                </div>

                                {marOrders.length === 0 ? (
                                    <div className="ipdc-empty">No scheduled inpatient medication orders exist for this admission yet. Prescribe medications in Doctor IPD Orders first.</div>
                                ) : (
                                    <div className="mar-grid-scroll">
                                        <table className="mar-interactive-table">
                                            <thead>
                                                <tr>
                                                    <th className="sticky-med-col right-lbl" rowSpan={1}>Date</th>
                                                    {activeFourDates.map((dKey) => (
                                                        <th key={dKey} colSpan={4} className="day-group-hdr">
                                                            {formatDateDisplay(dKey)}
                                                        </th>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    <th className="sticky-med-col right-lbl">Time</th>
                                                    {activeFourDates.map((dKey) => (
                                                        DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => (
                                                            <th key={`${dKey}-${slotName}`} className={`slot-hdr ${sIdx === 0 ? 'day-edge' : ''}`}>
                                                                {slotName}
                                                            </th>
                                                        ))
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {marOrders.map((ord) => {
                                                    const doseStr = `${ord.dosageValue ?? ord.dosage?.value ?? ''} ${ord.dosageUnit || ord.dosage?.unit || ''}`.trim();
                                                    const drRaw = ord.doctorId?.name || '';
                                                    const drStr = drRaw ? (/^dr/i.test(drRaw) ? drRaw : `Dr. ${drRaw}`) : '—';
                                                    const startStr = ord.startDate ? formatDateDisplay(ord.startDate) : '—';
                                                    const isInactive = ['CANCELLED', 'ON_HOLD', 'COMPLETED'].includes(ord.status);

                                                    return (
                                                        <tr key={ord._id} className={isInactive ? 'inactive-order-row' : ''}>
                                                            <td className="sticky-med-col med-info-cell">
                                                                <div className="med-name-top">
                                                                    <span>{ord.medicineName}</span>
                                                                    <span className={`ord-tag ord-${String(ord.status || 'ACTIVE').toLowerCase()}`}>
                                                                        {ord.status === 'CANCELLED' ? 'Discontinued' : ord.status}
                                                                    </span>
                                                                </div>
                                                                <div className="med-sub-grid">
                                                                    <div><span>Date</span><strong>{startStr}</strong></div>
                                                                    <div><span>Route</span><strong>{ord.route || '—'}</strong></div>
                                                                    <div><span>Dose</span><strong>{doseStr || '—'}</strong></div>
                                                                    <div><span>Prescribed by</span><strong>{drStr}</strong></div>
                                                                </div>
                                                            </td>
                                                            {activeFourDates.map((dKey) => (
                                                                DRUG_CHART_TIME_SLOTS.map((slotName, sIdx) => {
                                                                    const mar = marCellLookup.get(`${String(ord._id)}::${dKey}::${slotName}`);
                                                                    const st = formatMarCellStatus(mar);
                                                                    return (
                                                                        <td
                                                                            key={`${ord._id}-${dKey}-${slotName}`}
                                                                            className={`mar-slot-td ${sIdx === 0 ? 'day-edge' : ''} ${mar ? `cell-${st.code.toLowerCase()}` : 'cell-empty'}`}
                                                                            onClick={() => openMarCellPopup(ord, dKey, slotName)}
                                                                            title={mar ? `${st.label}${mar.administeredByName ? ` by ${mar.administeredByName}` : ''}` : `Click to record ${ord.medicineName} at ${slotName}`}
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
                                                                                <span className="cell-plus">{canNurseAdminister ? '+' : '·'}</span>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })
                                                            ))}
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

                    {/* =========================================================
                        EXACT A4 PDF PREVIEW FOR DRUG CHART (PAGE 1 & PAGE 2)
                       ========================================================= */}
                    {!loading && (activeTab === 'drug_stat_iv' || activeTab === 'drug_mar') && (viewMode === 'preview' || isBlank) && (
                        <div className="ipdc-sheets-stack">
                            {/* PAGE 1 PREVIEW */}
                            <div className="ipdc-a4-sheet">
                                {renderPatientStrip()}
                                {renderExactLetterhead()}
                                <div className="dc-prev-allergy">
                                    <strong>DRUG ALLERGY :</strong>
                                    <span>1.</span>
                                    <span className="dc-prev-dots red">{isBlank ? '' : (allergyForm.slot1 || existingAllergies.combinedSuggestions?.[0] || '')}</span>
                                    <span>2.</span>
                                    <span className="dc-prev-dots red">{isBlank ? '' : (allergyForm.slot2 || existingAllergies.combinedSuggestions?.[1] || '')}</span>
                                    <span>Sheet No.</span>
                                    <span className="dc-prev-dots sm">{isBlank ? '' : (allergyForm.sheetNo || '1')}</span>
                                </div>

                                <div className="dc-prev-sec-title">ONCE-ONLY PRESCRIPTION (STAT-DOSES)</div>
                                <table className="dc-prev-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th><th>Drug</th><th>Dose</th><th>Route</th><th>Time</th><th>Doctor</th><th>Given By</th><th>Checked by</th><th>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: DRUG_CHART_STAT_ROWS_PER_PAGE }, (_, r) => {
                                            const s = isBlank ? null : combinedStatRows[r];
                                            return (
                                                <tr key={r}>
                                                    <td className="c">{s ? s.date : ''}</td>
                                                    <td>{s ? s.drugName : ''}</td>
                                                    <td className="c">{s ? s.dose : ''}</td>
                                                    <td className="c">{s ? s.route : ''}</td>
                                                    <td className="c">{s ? s.time : ''}</td>
                                                    <td>{s ? s.doctorName : ''}</td>
                                                    <td>{s ? s.givenByName : ''}</td>
                                                    <td>{s ? s.checkedByName : ''}</td>
                                                    <td>{s ? (s.remarks || (s.status === 'PENDING' ? 'Pending' : s.status)) : ''}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div className="dc-prev-sec-title" style={{ marginTop: '10px' }}>I.V. FLUIDS</div>
                                <table className="dc-prev-table iv">
                                    <thead>
                                        <tr>
                                            <th>Date</th><th>Fluid</th><th>Volume</th><th>Time Start</th><th>Infusion<br />time(hrs.)</th><th>Doctor</th><th>Admin.by</th><th>Remarks</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: DRUG_CHART_IV_ROWS_PER_PAGE }, (_, r) => {
                                            const iv = isBlank ? null : combinedIvRows[r];
                                            return (
                                                <tr key={r}>
                                                    <td className="c">{iv ? iv.date : ''}</td>
                                                    <td>{iv ? iv.fluidName : ''}</td>
                                                    <td className="c">{iv ? iv.volume : ''}</td>
                                                    <td className="c">{iv ? iv.timeStart : ''}</td>
                                                    <td className="c">{iv ? iv.infusionTimeHrs : ''}</td>
                                                    <td>{iv ? iv.doctorName : ''}</td>
                                                    <td>{iv ? iv.adminByName : ''}</td>
                                                    <td>{iv ? iv.remarks : ''}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* PAGE 2 PREVIEW */}
                            <div className="ipdc-a4-sheet">
                                <div className="dc-prev-mar-sheet-inner">
                                    {renderDrugPage2PatientStrip()}
                                    <table className="dc-prev-mar-hdr">
                                        {renderDrugPage2ColGroup()}
                                        <tbody>
                                            <tr>
                                                <td colSpan={4} className="lbl">Date</td>
                                                {activeFourDates.map((dKey, i) => (
                                                    <td key={i} colSpan={4}>{isBlank ? '' : formatDateDisplay(dKey)}</td>
                                                ))}
                                            </tr>
                                            <tr>
                                                <td colSpan={4} className="lbl time-h">Time</td>
                                                {activeFourDates.map((dKey, di) => DRUG_CHART_TIME_SLOTS.map((sl, si) => (
                                                    <td key={`${di}-${si}`} className="vert-slot"><span>{sl}</span></td>
                                                )))}
                                            </tr>
                                        </tbody>
                                    </table>

                                    {Array.from({ length: DRUG_CHART_MAR_BLOCKS_PER_PAGE }, (_, bIdx) => {
                                        const ord = isBlank ? null : marOrders[bIdx];
                                        const startStr = ord?.startDate ? new Date(ord.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '';
                                        const doseStr = ord ? `${ord.dosageValue ?? ord.dosage?.value ?? ''} ${ord.dosageUnit || ord.dosage?.unit || ''}`.trim() : '';
                                        const drRaw = ord?.doctorId?.name || '';
                                        const drStr = drRaw ? (/^dr/i.test(drRaw) ? drRaw : `Dr. ${drRaw}`) : '';

                                        return (
                                            <table key={bIdx} className="dc-prev-mar-blk">
                                                {renderDrugPage2ColGroup()}
                                                <tbody>
                                                    <tr>
                                                        <td colSpan={4} className="blk-name">{ord ? `${ord.medicineName}${ord.status === 'CANCELLED' ? ' [DISCONTINUED]' : ''}` : ''}</td>
                                                        {activeFourDates.map((dKey, di) => DRUG_CHART_TIME_SLOTS.map((slotName, si) => {
                                                            const mar = (ord && dKey && !isBlank) ? marCellLookup.get(`${String(ord._id)}::${dKey}::${slotName}`) : null;
                                                            const st = mar ? formatMarCellStatus(mar) : null;
                                                            return (
                                                                <td key={`${di}-${si}`} rowSpan={3} className={`blk-slot ${si === 0 ? 'd-edge' : ''}`}>
                                                                    {st && <div style={{ color: st.color, fontWeight: 700, fontSize: '6.8px' }}>{st.shortLabel}</div>}
                                                                    {mar?.administeredTime && st?.code === 'GIVEN' && <div style={{ fontSize: '6.5px' }}>{formatShortTime(mar.administeredTime)}</div>}
                                                                    {(mar?.administeredByName || mar?.administeredBy?.name) && (
                                                                        <div style={{ fontSize: '6.5px', fontWeight: 700 }}>{getStaffInitials(mar.administeredByName || mar.administeredBy?.name)}</div>
                                                                    )}
                                                                </td>
                                                            );
                                                        }))}
                                                    </tr>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Route</th>
                                                        <th>Dose</th>
                                                        <th>Prescribed by</th>
                                                    </tr>
                                                    <tr>
                                                        <td className="c sub">{startStr}</td>
                                                        <td className="c sub">{ord?.route || ''}</td>
                                                        <td className="c sub">{doseStr}</td>
                                                        <td className="c sub">{drStr}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
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
            </div>
        </div>
    );
};

export default IPDClinicalChartsModal;
