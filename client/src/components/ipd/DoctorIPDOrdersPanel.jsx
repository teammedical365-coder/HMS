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
    FiUserCheck,
    FiX
} from 'react-icons/fi';
import './DoctorIPDOrdersPanel.css';

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
    patientId,
    patient = {},
    appointment = null,
    currentUser = null,
    onOrderCreated = null
}) => {
    const { user: authUser } = useAuth();
    const activeDoctor = currentUser || authUser;
    const hospitalId = activeDoctor?.hospitalId;

    // Active sub-tab: 'orders', 'clarifications', 'discharge'
    const [activeTab, setActiveTab] = useState('orders');

    // Active admission state
    const [activeAdmission, setActiveAdmission] = useState(null);
    const [loadingAdmission, setLoadingAdmission] = useState(true);

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
    }, [patientId]);

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
        }
    }, [activeAdmission, fetchClarifications, fetchNursingNotes, fetchDischargeSummary]);

    // Socket.IO real-time event listeners
    useEffect(() => {
        if (!socket) return;

        const handleOrderEvent = () => {
            fetchOrders();
            fetchClarifications();
            fetchNursingNotes();
            fetchAdmission();
        };

        const events = [
            'inpatient_order_created',
            'inpatient_order_updated',
            'doctor_order_acknowledged',
            'order_clarification_requested',
            'order_clarification_resolved',
            'nursing_note_created',
            'discharge_summary_updated'
        ];

        events.forEach(evt => socket.on(evt, handleOrderEvent));

        return () => {
            events.forEach(evt => socket.off(evt, handleOrderEvent));
        };
    }, [fetchOrders, fetchClarifications, fetchNursingNotes, fetchAdmission]);

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
            {/* Header */}
            <div className="ipd-header">
                <div>
                    <h3>
                        <span>🏥</span> IPD Clinical Care & Doctor Orders
                    </h3>
                    <div className="ipd-header-meta">
                        Patient: <strong>{patientName}</strong> (MRN: {patientMRN}) &nbsp;|&nbsp; 
                        Attending: <strong>Dr. {activeDoctor?.name || 'Physician'}</strong>
                    </div>
                </div>

                <div>
                    {loadingAdmission ? (
                        <span className="ipd-badge-status ipd-badge-checking">
                            Checking Admission...
                        </span>
                    ) : activeAdmission ? (
                        <span className="ipd-badge-status ipd-badge-admitted">
                            🟢 Hospitalized / Admitted: {activeAdmission.ward} — Bed {activeAdmission.bedNumber || activeAdmission.bedId?.bedNumber || 'Assigned'}
                        </span>
                    ) : (
                        <span className="ipd-badge-status ipd-badge-pending" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            ⚠️ Not Hospitalized (OPD Patient)
                        </span>
                    )}
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="ipd-sub-tabs">
                <button
                    type="button"
                    className={`sub-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
                    onClick={() => setActiveTab('orders')}
                >
                    <FiLayers />
                    <span>Inpatient Orders & MAR</span>
                    <span className="count-pill">{existingOrders.length}</span>
                </button>

                <button
                    type="button"
                    className={`sub-tab-btn ${activeTab === 'clarifications' ? 'active' : ''}`}
                    onClick={() => setActiveTab('clarifications')}
                >
                    <FiHelpCircle />
                    <span>Nurse Clarification Inbox</span>
                    {openClarificationsCount > 0 ? (
                        <span className="count-pill badge-urgent">{openClarificationsCount} Open</span>
                    ) : (
                        <span className="count-pill">{clarifications.length}</span>
                    )}
                </button>

                <button
                    type="button"
                    className={`sub-tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                    onClick={() => setActiveTab('notes')}
                >
                    <FiMessageSquare />
                    <span>Nursing Notes</span>
                    <span className="count-pill">{nursingNotes.length}</span>
                </button>

                <button
                    type="button"
                    className={`sub-tab-btn ${activeTab === 'discharge' ? 'active' : ''}`}
                    onClick={() => setActiveTab('discharge')}
                >
                    <FiFileText />
                    <span>Structured Discharge Summary</span>
                    {summaryDoctorSigned && (
                        <span className="count-pill badge-signed">✓ Signed</span>
                    )}
                </button>
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

            {/* ── TAB 1: INPATIENT ORDERS ENTRY & LIST ── */}
            {activeTab === 'orders' && (
                <div>
                    {/* Orders Creation Form */}
                    <form onSubmit={handleSubmitOrders}>
                        <div className="ipd-section">
                            <h4 className="ipd-section-title">
                                <FiActivity /> Clinical Admission Indication
                            </h4>
                            <div className="ipd-form-grid-2">
                                <div className="ipd-field-group">
                                    <label>Clinical Diagnosis <span className="req">*</span></label>
                                    <input
                                        type="text"
                                        className="ipd-input"
                                        placeholder="e.g. Acute Appendicitis, Severe Sepsis"
                                        value={diagnosis}
                                        onChange={(e) => setDiagnosis(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="ipd-field-group">
                                    <label>Primary Admission Indication</label>
                                    <select
                                        className="ipd-select"
                                        value={admissionReason}
                                        onChange={(e) => setAdmissionReason(e.target.value)}
                                    >
                                        {ADMISSION_REASONS.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {admissionReason === 'Other Clinical Indication' && (
                                <div className="ipd-field-group" style={{ marginTop: '12px' }}>
                                    <label>Specify Indication</label>
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

                        {/* Medications Section */}
                        <div className="ipd-section">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h4 className="ipd-section-title" style={{ margin: 0 }}>
                                    💊 Inpatient Medication Orders (MAR Linked)
                                </h4>
                                <button
                                    type="button"
                                    className="ipd-btn-add-row-sm"
                                    onClick={addMedRow}
                                >
                                    <FiPlus /> Add Drug
                                </button>
                            </div>

                            {medicationRows.map((med, idx) => (
                                <div key={idx} className="ipd-med-card">
                                    <div className="ipd-med-row-top">
                                        <div className="ipd-field-group">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <label>Medicine Name #{idx + 1} <span className="req">*</span></label>
                                                {pharmacyMedicines.length > 0 && (
                                                    <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 600 }}>
                                                        🏬 Pharmacy Dropdown ({pharmacyMedicines.length})
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="text"
                                                list={`pharmacy-med-list-${idx}`}
                                                className="ipd-input"
                                                placeholder="Select from pharmacy or type custom medicine name..."
                                                value={med.medicineName}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleMedRowChange(idx, 'medicineName', val);
                                                    const matched = pharmacyMedicines.find(p => p.name.toLowerCase() === val.toLowerCase());
                                                    if (matched) {
                                                        handleSelectPharmacyMedicine(idx, matched);
                                                    }
                                                }}
                                            />
                                            <datalist id={`pharmacy-med-list-${idx}`}>
                                                {pharmacyMedicines.map((item, i) => (
                                                    <option key={item._id || i} value={item.name}>
                                                        {item.salt ? `${item.salt} • ` : ''}{item.category || 'General'} (Stock: {item.stock ?? item.quantity ?? 0} {item.unit || ''})
                                                    </option>
                                                ))}
                                            </datalist>
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

                                    <div className="ipd-med-row-bottom">
                                        <div className="ipd-field-group">
                                            <label>Frequency</label>
                                            <select
                                                className="ipd-select"
                                                value={med.frequency}
                                                onChange={(e) => handleMedRowChange(idx, 'frequency', e.target.value)}
                                            >
                                                {COMMON_FREQUENCIES.map(f => (
                                                    <option key={f} value={f}>{f}</option>
                                                ))}
                                            </select>
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

                                        <button
                                            type="button"
                                            className="ipd-btn-remove"
                                            onClick={() => removeMedRow(idx)}
                                            title="Remove Row"
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </div>

                                    {/* Manual Administration Timing Selector */}
                                    <div className="ipd-med-row-timing" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FiClock size={14} style={{ color: '#0284c7' }} />
                                                Manual Administration Time Slots ({med.frequency || 'OD'}):
                                            </label>
                                            <button
                                                type="button"
                                                className="ipd-btn-add-time-slot"
                                                onClick={() => handleAddTimeSlot(idx)}
                                                style={{
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600,
                                                    color: '#2563eb',
                                                    background: '#eff6ff',
                                                    border: '1px solid #bfdbfe',
                                                    borderRadius: '5px',
                                                    padding: '3px 10px',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <FiPlus size={12} /> Add Dose Time
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                            {(med.scheduledTimes || []).map((slot, sIdx) => (
                                                <div
                                                    key={sIdx}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        background: '#ffffff',
                                                        border: '1.5px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        padding: '3px 8px',
                                                        gap: '6px',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                                    }}
                                                >
                                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b' }}>Dose {sIdx + 1}:</span>
                                                    <input
                                                        type="text"
                                                        value={slot}
                                                        onChange={(e) => handleTimeSlotChange(idx, sIdx, e.target.value)}
                                                        placeholder="e.g. 10:00 AM or 14:00"
                                                        style={{
                                                            width: '95px',
                                                            border: 'none',
                                                            background: 'transparent',
                                                            fontSize: '0.84rem',
                                                            fontWeight: 700,
                                                            color: '#0f172a',
                                                            outline: 'none'
                                                        }}
                                                    />
                                                    {(med.scheduledTimes || []).length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveTimeSlot(idx, sIdx)}
                                                            style={{
                                                                border: 'none',
                                                                background: 'transparent',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                padding: '0 2px',
                                                                display: 'flex',
                                                                alignItems: 'center'
                                                            }}
                                                            title="Remove time slot"
                                                        >
                                                            <FiX size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                            <span style={{ fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic' }}>
                                                (Type any custom time e.g. 09:30 AM or 21:00)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Special Directives */}
                        <div className="ipd-section">
                            <h4 className="ipd-section-title">
                                📋 Additional Nursing Directives & Advice
                            </h4>
                            <div className="ipd-form-grid-3">
                                <div className="ipd-field-group">
                                    <label>Lab / Diagnostic Advice</label>
                                    <textarea
                                        className="ipd-textarea"
                                        placeholder="e.g. CBC, Serum Creatinine, Chest X-Ray stat"
                                        value={investigationNotes}
                                        onChange={(e) => setInvestigationNotes(e.target.value)}
                                    />
                                </div>

                                <div className="ipd-field-group">
                                    <label>Procedure / OT Advice</label>
                                    <textarea
                                        className="ipd-textarea"
                                        placeholder="e.g. NPO from midnight, prep for Laparoscopy"
                                        value={procedureNotes}
                                        onChange={(e) => setProcedureNotes(e.target.value)}
                                    />
                                </div>

                                <div className="ipd-field-group">
                                    <label>General Nursing Orders</label>
                                    <textarea
                                        className="ipd-textarea"
                                        placeholder="e.g. Strict I/O charting, continuous SpO2 monitoring"
                                        value={clinicalNotes}
                                        onChange={(e) => setClinicalNotes(e.target.value)}
                                    />
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

                                            let badgeClass = 'ipd-status-active';
                                            if (isCancelled) badgeClass = 'ipd-status-cancelled';
                                            else if (isCompleted) badgeClass = 'ipd-status-completed';

                                            const acknowledgments = order.acknowledgments || [];
                                            const hasAck = acknowledgments.length > 0;
                                            const lastAck = hasAck ? acknowledgments[acknowledgments.length - 1] : null;

                                            const openClar = (order.clarifications || []).find(c => c.status === 'OPEN');

                                            return (
                                                <tr key={order._id}>
                                                    <td style={{ fontWeight: 600 }}>
                                                        <div>{order.medicineName}</div>
                                                        {order.instructions && (
                                                            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 400, marginTop: '2px' }}>
                                                                📝 {order.instructions}
                                                            </div>
                                                        )}
                                                        {order.clinicalNotes && (
                                                            <div style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 500, marginTop: '2px', whiteSpace: 'pre-wrap' }}>
                                                                💬 {order.clinicalNotes}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {order.dosage?.value ?? order.dosageValue ?? '—'} {order.dosage?.unit || order.dosageUnit || ''}
                                                    </td>
                                                    <td>
                                                        <span className="route-badge">{order.route || 'Oral'}</span>
                                                    </td>
                                                    <td>
                                                        <strong>{order.frequency || 'OD'}</strong>
                                                        {order.scheduledTimes && order.scheduledTimes.length > 0 && (
                                                            <div style={{ fontSize: '0.72rem', color: '#0284c7', marginTop: '2px', fontWeight: 600 }}>
                                                                ⏰ {order.scheduledTimes.join(', ')}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {order.schedule?.duration || order.duration || '—'}
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                            {(order.schedule?.startDate || order.startDate) ? new Date(order.schedule?.startDate || order.startDate).toLocaleDateString() : ''}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {hasAck ? (
                                                            <span className="ack-pill acknowledged">
                                                                <FiCheck /> Ack ({lastAck.shift || 'Shift'})
                                                            </span>
                                                        ) : (
                                                            <span className="ack-pill pending">
                                                                Pending Ack
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
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
                                                    <td>
                                                        <span className={badgeClass}>{order.status}</span>
                                                    </td>
                                                    <td>
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
                            <p>Direct communication channel for drug contraindications, dosage double-checks, and clinical inquiries</p>
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
                                <div className="ipd-form-grid-2">
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
                                        <input
                                            type="text"
                                            className="ipd-input"
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
        </div>
    );
};

export default DoctorIPDOrdersPanel;
