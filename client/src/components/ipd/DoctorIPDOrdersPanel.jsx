import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ipdClinicalAPI, admissionAPI, doctorAPI } from '../../utils/api';
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
    dosageValue: '',
    dosageUnit: 'mg',
    route: 'Oral',
    frequency: 'BD',
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

    // Fetch active admission for this patient
    const fetchAdmission = useCallback(async () => {
        if (!patientId) return;
        setLoadingAdmission(true);
        try {
            const res = await admissionAPI.getAdmissions({
                patientId: patientId,
                status: 'ADMITTED'
            });
            const list = res.data?.admissions || res.data || [];
            const active = list.find(a => a.status === 'ADMITTED' || a.status === 'Admitted');
            setActiveAdmission(active || null);
        } catch (err) {
            console.warn('Could not fetch patient admission status', err);
            setActiveAdmission(null);
        } finally {
            setLoadingAdmission(false);
        }
    }, [patientId]);

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

    useEffect(() => {
        fetchAdmission();
        fetchOrders();
    }, [fetchAdmission, fetchOrders]);

    useEffect(() => {
        if (activeAdmission?._id) {
            fetchClarifications();
            fetchDischargeSummary();
        }
    }, [activeAdmission, fetchClarifications, fetchDischargeSummary]);

    // Socket.IO real-time event listeners
    useEffect(() => {
        if (!socket) return;

        const handleOrderEvent = () => {
            fetchOrders();
            fetchClarifications();
            fetchAdmission();
        };

        const events = [
            'inpatient_order_created',
            'inpatient_order_updated',
            'doctor_order_acknowledged',
            'order_clarification_requested',
            'order_clarification_resolved',
            'discharge_summary_updated'
        ];

        events.forEach(evt => socket.on(evt, handleOrderEvent));

        return () => {
            events.forEach(evt => socket.off(evt, handleOrderEvent));
        };
    }, [fetchOrders, fetchClarifications, fetchAdmission]);

    // Medicine row management
    const handleMedRowChange = (index, field, value) => {
        setMedicationRows(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
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
                    dosage: {
                        value: Number(med.dosageValue),
                        unit: med.dosageUnit
                    },
                    route: med.route,
                    frequency: med.frequency,
                    schedule: {
                        startDate: startDate,
                        endDate: endDate,
                        duration: med.duration || '3 days'
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
                            🟢 Admitted: {activeAdmission.ward} — Bed {activeAdmission.bedId?.bedNumber || 'Assigned'}
                        </span>
                    ) : (
                        <span className="ipd-badge-status ipd-badge-pending">
                            🟡 Outpatient / Pre-Admission
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
                                            <label>Medicine Name #{idx + 1} <span className="req">*</span></label>
                                            <input
                                                type="text"
                                                className="ipd-input"
                                                placeholder="e.g. Inj. Ceftriaxone, Tab. Paracetamol"
                                                value={med.medicineName}
                                                onChange={(e) => handleMedRowChange(idx, 'medicineName', e.target.value)}
                                            />
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
                                disabled={submitting}
                            >
                                {submitting ? 'Placing Orders...' : '🚀 Submit Clinical Orders'}
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
                                                    <td style={{ fontWeight: 600 }}>{order.medicineName}</td>
                                                    <td>{order.dosage?.value} {order.dosage?.unit}</td>
                                                    <td>
                                                        <span className="route-badge">{order.route}</span>
                                                    </td>
                                                    <td><strong>{order.frequency}</strong></td>
                                                    <td>
                                                        {order.schedule?.duration || '—'}
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                            {order.schedule?.startDate ? new Date(order.schedule.startDate).toLocaleDateString() : ''}
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

                    {loadingClarifications ? (
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

            {/* ── TAB 3: STRUCTURED DISCHARGE SUMMARY ── */}
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
                            >
                                <FiPrinter />
                                <span>Print Summary</span>
                            </button>
                        </div>
                    </div>

                    {loadingSummary ? (
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
        </div>
    );
};

export default DoctorIPDOrdersPanel;
