import React, { useState, useEffect, useCallback } from 'react';
import { ipdClinicalAPI, admissionAPI, doctorAPI } from '../../utils/api';
import socket from '../../utils/socket';
import { useAuth } from '../../store/hooks';
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

    // Active admission state
    const [activeAdmission, setActiveAdmission] = useState(null);
    const [loadingAdmission, setLoadingAdmission] = useState(true);

    // Form fields
    const [admissionRequired, setAdmissionRequired] = useState(true);
    const [admissionReason, setAdmissionReason] = useState('Observation & Monitoring');
    const [customReason, setCustomReason] = useState('');
    const [diagnosis, setDiagnosis] = useState(
        appointment?.diagnosis || appointment?.department || ''
    );
    const [clinicalNotes, setClinicalNotes] = useState('');
    const [investigationNotes, setInvestigationNotes] = useState('');
    const [procedureNotes, setProcedureNotes] = useState('');
    const [anesthesiaNotes, setAnesthesiaNotes] = useState('');

    // Medication rows
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
            const active = list.find(a => a.status === 'ADMITTED');
            setActiveAdmission(active || null);
        } catch (err) {
            console.warn('Could not fetch patient admission status', err);
            setActiveAdmission(null);
        } finally {
            setLoadingAdmission(false);
        }
    }, [patientId]);

    // Fetch orders (either for admission or patient)
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

    useEffect(() => {
        fetchAdmission();
        fetchOrders();
    }, [fetchAdmission, fetchOrders]);

    // Socket.IO real-time event listeners
    useEffect(() => {
        if (!socket) return;

        if (!socket.connected) {
            socket.connect();
        }

        if (hospitalId) {
            socket.emit('joinHospitalRoom', hospitalId);
        }

        const handleOrderCreated = (data) => {
            if (data?.patientId === patientId || data?.patientId?._id === patientId) {
                fetchOrders();
                fetchAdmission();
            }
        };

        const handleOrderUpdated = (data) => {
            if (data?.patientId === patientId || data?.patientId?._id === patientId) {
                fetchOrders();
            }
        };

        const handleAdmissionCreated = (data) => {
            if (data?.patientId === patientId || data?.patientId?._id === patientId) {
                fetchAdmission();
                fetchOrders();
            }
        };

        const handleReconnect = () => {
            fetchAdmission();
            fetchOrders();
        };

        socket.on('inpatient_order_created', handleOrderCreated);
        socket.on('inpatient_order_updated', handleOrderUpdated);
        socket.on('admission_created', handleAdmissionCreated);
        socket.on('connect', handleReconnect);

        return () => {
            socket.off('inpatient_order_created', handleOrderCreated);
            socket.off('inpatient_order_updated', handleOrderUpdated);
            socket.off('admission_created', handleAdmissionCreated);
            socket.off('connect', handleReconnect);
        };
    }, [hospitalId, patientId, fetchOrders, fetchAdmission]);

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

    // Form Submission
    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');

        // Validation
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

        // Compile combined clinical notes
        let compiledNotes = clinicalNotes ? `Notes: ${clinicalNotes}` : '';
        if (investigationNotes.trim()) {
            compiledNotes += `\n[Lab/Investigations Advice]: ${investigationNotes.trim()}`;
        }
        if (procedureNotes.trim()) {
            compiledNotes += `\n[Planned Procedure Advice]: ${procedureNotes.trim()}`;
        }
        if (anesthesiaNotes.trim()) {
            compiledNotes += `\n[Anesthesia Advice]: ${anesthesiaNotes.trim()}`;
        }

        setSubmitting(true);
        try {
            // Submit each medication order sequentially
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

            setSuccessMsg('✅ IPD Clinical Orders submitted successfully!');
            // Reset medication rows to empty default
            setMedicationRows([createEmptyMedRow()]);
            setInvestigationNotes('');
            setProcedureNotes('');
            setAnesthesiaNotes('');
            setClinicalNotes('');

            // Refetch orders list from backend
            fetchOrders();
            fetchAdmission();

            if (onOrderCreated) {
                onOrderCreated();
            }
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

    const patientName = patient?.name || patient?.userId?.name || 'Selected Patient';
    const patientMRN = patient?.patientId || patient?.mrn || 'N/A';

    return (
        <div className="ipd-orders-panel">
            {/* Header */}
            <div className="ipd-header">
                <div>
                    <h3>
                        <span>🏥</span> IPD / Hospitalization Clinical Orders
                    </h3>
                    <div style={{ fontSize: '0.86rem', color: '#64748b', marginTop: '4px' }}>
                        Patient: <strong>{patientName}</strong> (MRN: {patientMRN}) &nbsp;|&nbsp; 
                        Attending Doctor: <strong>Dr. {activeDoctor?.name || 'Physician'}</strong>
                    </div>
                </div>

                <div>
                    {loadingAdmission ? (
                        <span className="ipd-badge-status" style={{ background: '#f1f5f9', color: '#64748b' }}>
                            Checking Admission...
                        </span>
                    ) : activeAdmission ? (
                        <span className="ipd-badge-status ipd-badge-admitted">
                            🟢 Admitted: {activeAdmission.ward} — Bed {activeAdmission.bedId?.bedNumber || 'Assigned'}
                        </span>
                    ) : (
                        <span className="ipd-badge-status ipd-badge-pending">
                            🟡 Pre-Admission (Pending Bed Allocation by Reception)
                        </span>
                    )}
                </div>
            </div>

            {/* Notification messages */}
            {errorMsg && (
                <div style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#991b1b',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    marginBottom: '16px'
                }}>
                    ❌ {errorMsg}
                </div>
            )}
            {successMsg && (
                <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    marginBottom: '16px'
                }}>
                    {successMsg}
                </div>
            )}

            {/* CREATE ORDER FORM */}
            <form onSubmit={handleSubmit}>
                {/* SECTION A: Admission Decision & Clinical Reason */}
                <div className="ipd-section">
                    <div className="ipd-section-title">
                        <span>🩺</span> Section A: Clinical Reason &amp; Attending Physician
                    </div>

                    <div className="ipd-form-grid-2">
                        <div className="ipd-field-group">
                            <label>Admission Recommended / Required *</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '42px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="admissionRequired"
                                        checked={admissionRequired}
                                        onChange={() => setAdmissionRequired(true)}
                                    />
                                    <span style={{ fontWeight: 600, color: '#166534' }}>Yes (Inpatient Admission)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                    <input
                                        type="radio"
                                        name="admissionRequired"
                                        checked={!admissionRequired}
                                        onChange={() => setAdmissionRequired(false)}
                                    />
                                    <span style={{ color: '#64748b' }}>Observation Only</span>
                                </label>
                            </div>
                        </div>

                        <div className="ipd-field-group">
                            <label>Attending Doctor (Locked to Authenticated Doctor)</label>
                            <input
                                type="text"
                                className="ipd-input"
                                value={`Dr. ${activeDoctor?.name || 'Physician'} (${activeDoctor?.department || 'General Medicine'})`}
                                disabled
                                style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#334155', fontWeight: 600 }}
                            />
                        </div>
                    </div>

                    <div className="ipd-form-grid-2" style={{ marginTop: '14px' }}>
                        <div className="ipd-field-group">
                            <label>Primary Admission Reason *</label>
                            <select
                                className="ipd-select"
                                value={admissionReason}
                                onChange={(e) => setAdmissionReason(e.target.value)}
                                required
                            >
                                {ADMISSION_REASONS.map((reason) => (
                                    <option key={reason} value={reason}>{reason}</option>
                                ))}
                            </select>
                        </div>

                        <div className="ipd-field-group">
                            <label>Clinical Diagnosis *</label>
                            <input
                                type="text"
                                className="ipd-input"
                                placeholder="e.g. Acute Gastroenteritis with severe dehydration"
                                value={diagnosis}
                                onChange={(e) => setDiagnosis(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    {admissionReason === 'Other Clinical Indication' && (
                        <div className="ipd-field-group" style={{ marginTop: '12px' }}>
                            <label>Specify Custom Reason *</label>
                            <input
                                type="text"
                                className="ipd-input"
                                placeholder="Enter specific clinical indication..."
                                value={customReason}
                                onChange={(e) => setCustomReason(e.target.value)}
                                required
                            />
                        </div>
                    )}

                    <div className="ipd-field-group" style={{ marginTop: '14px' }}>
                        <label>Clinical Justification &amp; Admission Notes</label>
                        <textarea
                            className="ipd-textarea"
                            placeholder="Provide clinical summary, admission instructions, and patient monitoring objectives..."
                            value={clinicalNotes}
                            onChange={(e) => setClinicalNotes(e.target.value)}
                            rows={2}
                        />
                    </div>
                </div>

                {/* SECTION B: Structured Medication Orders */}
                <div className="ipd-section">
                    <div className="ipd-section-title">
                        <span>💊</span> Section B: Structured Inpatient Medication Orders
                    </div>
                    <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748b' }}>
                        Define each medication order with specific dose, route, frequency, and administration instructions.
                        Nurses will directly execute these orders via the electronic MAR.
                    </p>

                    {medicationRows.map((med, index) => (
                        <div key={index} className="ipd-med-card">
                            <div className="ipd-med-row-top">
                                <div className="ipd-field-group">
                                    <label>Medicine Name *</label>
                                    <input
                                        type="text"
                                        className="ipd-input"
                                        placeholder="e.g. Paracetamol, Ceftriaxone, Pantoprazole"
                                        value={med.medicineName}
                                        onChange={(e) => handleMedRowChange(index, 'medicineName', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="ipd-field-group">
                                    <label>Dose *</label>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0.1"
                                        className="ipd-input"
                                        placeholder="500"
                                        value={med.dosageValue}
                                        onChange={(e) => handleMedRowChange(index, 'dosageValue', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="ipd-field-group">
                                    <label>Unit *</label>
                                    <select
                                        className="ipd-select"
                                        value={med.dosageUnit}
                                        onChange={(e) => handleMedRowChange(index, 'dosageUnit', e.target.value)}
                                    >
                                        {COMMON_UNITS.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="ipd-field-group">
                                    <label>Route *</label>
                                    <select
                                        className="ipd-select"
                                        value={med.route}
                                        onChange={(e) => handleMedRowChange(index, 'route', e.target.value)}
                                    >
                                        {COMMON_ROUTES.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="ipd-med-row-bottom">
                                <div className="ipd-field-group">
                                    <label>Frequency *</label>
                                    <select
                                        className="ipd-select"
                                        value={med.frequency}
                                        onChange={(e) => handleMedRowChange(index, 'frequency', e.target.value)}
                                    >
                                        {COMMON_FREQUENCIES.map(f => (
                                            <option key={f} value={f}>{f}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="ipd-field-group">
                                    <label>Start Date *</label>
                                    <input
                                        type="date"
                                        className="ipd-input"
                                        value={med.startDate}
                                        onChange={(e) => handleMedRowChange(index, 'startDate', e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="ipd-field-group">
                                    <label>Duration / Schedule</label>
                                    <input
                                        type="text"
                                        className="ipd-input"
                                        placeholder="e.g. 3 days, 5 days, 1 week"
                                        value={med.duration}
                                        onChange={(e) => handleMedRowChange(index, 'duration', e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="ipd-btn-remove"
                                    title="Remove this medicine row"
                                    onClick={() => removeMedRow(index)}
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="ipd-field-group" style={{ marginTop: '8px' }}>
                                <label>Administration Instructions (Nursing Instructions)</label>
                                <input
                                    type="text"
                                    className="ipd-input"
                                    placeholder="e.g. After food, Infuse slowly in 100ml NS over 30 mins, SOS for temp > 100°F"
                                    value={med.instructions}
                                    onChange={(e) => handleMedRowChange(index, 'instructions', e.target.value)}
                                />
                            </div>
                        </div>
                    ))}

                    <button
                        type="button"
                        className="ipd-btn-add-row"
                        onClick={addMedRow}
                    >
                        + Add Another Medication Order
                    </button>
                </div>

                {/* SECTION C: Diagnostic / Investigation Advice & Planned Procedures */}
                <div className="ipd-section">
                    <div className="ipd-section-title">
                        <span>🧪</span> Section C: Investigations, Procedures &amp; Anesthesia Advice
                    </div>
                    <div className="ipd-form-grid-3">
                        <div className="ipd-field-group">
                            <label>Diagnostic / Lab Investigations Advice</label>
                            <textarea
                                className="ipd-textarea"
                                placeholder="e.g. CBC, Serum Electrolytes, Blood Urea, Creatinine on admission"
                                value={investigationNotes}
                                onChange={(e) => setInvestigationNotes(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="ipd-field-group">
                            <label>Planned Procedure / Surgical Advice</label>
                            <textarea
                                className="ipd-textarea"
                                placeholder="e.g. Emergency Appendectomy scheduled for 4 PM, NPO after midnight"
                                value={procedureNotes}
                                onChange={(e) => setProcedureNotes(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="ipd-field-group">
                            <label>Anesthesia / Pre-Op Consideration</label>
                            <textarea
                                className="ipd-textarea"
                                placeholder="e.g. Spinal anesthesia PAC clearance requested, check coagulation profile"
                                value={anesthesiaNotes}
                                onChange={(e) => setAnesthesiaNotes(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>
                </div>

                {/* SUBMIT BUTTON */}
                <div className="ipd-actions-footer">
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        Clinical orders are authoritative and audited upon submission.
                    </span>
                    <button
                        type="submit"
                        className="ipd-btn-submit"
                        disabled={submitting}
                    >
                        {submitting ? '⏳ Submitting Orders...' : '📋 Create IPD Clinical Orders'}
                    </button>
                </div>
            </form>

            {/* ACTIVE & HISTORICAL ORDERS LIST */}
            <div style={{ marginTop: '36px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a', fontWeight: 700 }}>
                        📋 Active Inpatient Clinical Orders for this Patient
                    </h4>
                    <button
                        type="button"
                        onClick={fetchOrders}
                        style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        🔄 Refresh Orders
                    </button>
                </div>

                {loadingOrders ? (
                    <div className="ipd-loading-state">Loading authoritative clinical orders...</div>
                ) : existingOrders.length === 0 ? (
                    <div className="ipd-empty-state">
                        <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📋</div>
                        <div style={{ fontWeight: 600 }}>No inpatient orders found for this patient.</div>
                        <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                            Use the form above to prescribe medication and admission orders.
                        </div>
                    </div>
                ) : (
                    <div className="ipd-orders-table-wrapper">
                        <table className="ipd-orders-table">
                            <thead>
                                <tr>
                                    <th>Medicine</th>
                                    <th>Dose</th>
                                    <th>Route</th>
                                    <th>Frequency</th>
                                    <th>Duration / Start</th>
                                    <th>Instructions</th>
                                    <th>Doctor</th>
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

                                    const formattedStartDate = order.schedule?.startDate
                                        ? new Date(order.schedule.startDate).toLocaleDateString()
                                        : '-';

                                    return (
                                        <tr key={order._id}>
                                            <td style={{ fontWeight: 600 }}>
                                                {order.medicineName}
                                            </td>
                                            <td>
                                                {order.dosage?.value} {order.dosage?.unit}
                                            </td>
                                            <td>
                                                <span style={{
                                                    background: '#f1f5f9',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.78rem'
                                                }}>
                                                    {order.route}
                                                </span>
                                            </td>
                                            <td>
                                                <strong>{order.frequency}</strong>
                                            </td>
                                            <td>
                                                {order.schedule?.duration || formattedStartDate}
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    From: {formattedStartDate}
                                                </div>
                                            </td>
                                            <td style={{ maxWidth: '200px', fontSize: '0.82rem', color: '#475569' }}>
                                                {order.instructions || '-'}
                                            </td>
                                            <td style={{ fontSize: '0.82rem' }}>
                                                Dr. {order.doctorId?.name || 'Assigned'}
                                            </td>
                                            <td>
                                                <span className={badgeClass}>
                                                    {order.status}
                                                </span>
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

            {/* CANCEL CONFIRMATION MODAL */}
            {orderToCancel && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '480px',
                        width: '90%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                            <span style={{ fontSize: '1.8rem', color: '#dc2626' }}>⚠️</span>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>
                                Cancel Clinical Order?
                            </h3>
                        </div>

                        <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                            Are you sure you want to cancel the order for <strong>{orderToCancel.medicineName}</strong> ({orderToCancel.dosage?.value} {orderToCancel.dosage?.unit})?
                        </p>

                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #fee2e2',
                            borderRadius: '8px',
                            padding: '12px',
                            fontSize: '0.82rem',
                            color: '#991b1b',
                            marginBottom: '20px'
                        }}>
                            ℹ️ <strong>Clinical Audit Notice:</strong> This order will not be deleted from the database. Its status will be updated to <strong>CANCELLED</strong> in the permanent audit trail. Any doses already administered in the MAR remain recorded.
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setOrderToCancel(null)}
                                disabled={cancelling}
                                style={{
                                    padding: '9px 16px',
                                    background: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    fontSize: '0.88rem',
                                    fontWeight: 600,
                                    color: '#475569',
                                    cursor: 'pointer'
                                }}
                            >
                                Keep Order
                            </button>
                            <button
                                type="button"
                                onClick={confirmCancelOrder}
                                disabled={cancelling}
                                style={{
                                    padding: '9px 18px',
                                    background: '#dc2626',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.88rem',
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    cursor: 'pointer'
                                }}
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
