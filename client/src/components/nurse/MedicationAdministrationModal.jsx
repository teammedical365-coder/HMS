import React, { useState } from 'react';
import {
    FiX,
    FiCheck,
    FiPause,
    FiAlertCircle,
    FiAlertTriangle,
    FiClock,
    FiUser,
    FiFileText,
    FiShield
} from 'react-icons/fi';
import './MedicationAdministrationModal.css';

const MedicationAdministrationModal = ({
    isOpen,
    onClose,
    marRecord,
    patient,
    currentNurseName,
    onConfirmAdministration
}) => {
    if (!isOpen || !marRecord) return null;

    const order = marRecord.orderId || {};
    const medicineName = order.medicineName || marRecord.medicineName || 'Medication';
    const prescribedDose = `${order.dosageValue || ''} ${order.dosageUnit || ''}`.trim();
    const route = order.route || 'Oral';
    const doctorName = order.doctorId?.name ? `Dr. ${order.doctorId.name}` : (order.doctorId || 'Attending Doctor');
    const scheduledTimeStr = marRecord.scheduledTime
        ? new Date(marRecord.scheduledTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '—';
    const currentTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    // State for action flow: 'GIVE' | 'HOLD' | 'REFUSE' | 'MISS'
    const [selectedAction, setSelectedAction] = useState('GIVE');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    const [actualDoseValue, setActualDoseValue] = useState(order.dosageValue || '');
    const [actualDoseUnit, setActualDoseUnit] = useState(order.dosageUnit || 'mg');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSubmit = async (actionType) => {
        setErrorMsg('');

        if (['HOLD', 'REFUSE', 'MISS'].includes(actionType) && !reason.trim()) {
            setErrorMsg('A specific reason is mandatory for Hold, Refused, or Missed medication.');
            return;
        }

        let finalStatus = 'ADMINISTERED';
        if (actionType === 'HOLD') finalStatus = 'HELD';
        if (actionType === 'REFUSE') finalStatus = 'REFUSED';
        if (actionType === 'MISS') finalStatus = 'MISSED';

        setSubmitting(true);
        try {
            await onConfirmAdministration({
                marId: marRecord._id,
                status: finalStatus,
                actualDoseValue: finalStatus === 'ADMINISTERED' ? Number(actualDoseValue) || order.dosageValue : undefined,
                actualDoseUnit: finalStatus === 'ADMINISTERED' ? actualDoseUnit : undefined,
                notes: notes.trim(),
                reason: reason.trim()
            });
            onClose();
        } catch (err) {
            setErrorMsg(err.message || 'Failed to record medication status.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mam-overlay" onClick={onClose}>
            <div className="mam-modal" onClick={e => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="mam-header">
                    <div className="mam-header-title">
                        <div className="mam-badge">CLINICAL MEDICATION ADMINISTRATION</div>
                        <h2>Administer Medication</h2>
                    </div>
                    <button className="mam-close-btn" onClick={onClose} disabled={submitting}>
                        <FiX size={18} />
                    </button>
                </div>

                {/* Patient & Prescription Info Box */}
                <div className="mam-body">
                    {/* Patient Bar */}
                    <div className="mam-patient-bar">
                        <div className="mam-pt-name">
                            <strong>{patient?.name || patient?.patientName || 'Inpatient'}</strong>
                            <span className="mam-pt-meta">
                                {patient?.gender} • {patient?.age ? `${patient.age} Yrs` : ''} • {patient?.ward} (Bed {patient?.bedNumber})
                            </span>
                        </div>
                        {patient?.patientId || patient?.mrn || patient?.patientUid ? (
                            <span className="mam-mrn">MRN: {patient?.patientId || patient?.mrn || patient?.patientUid}</span>
                        ) : null}
                    </div>

                    {/* Prescription Card (Nurse CANNOT change this order) */}
                    <div className="mam-rx-card">
                        <div className="mam-rx-header">
                            <span className="mam-rx-title">DOCTOR'S PRESCRIBED ORDER</span>
                            <span className="mam-rx-lock"><FiShield size={12} /> Read Only</span>
                        </div>
                        <div className="mam-rx-details">
                            <div className="mam-rx-med-name">{medicineName}</div>
                            <div className="mam-rx-specs">
                                <span className="mam-spec-pill dose">{prescribedDose || 'Standard Dose'}</span>
                                <span className="mam-spec-pill route">{route}</span>
                                <span className="mam-spec-pill freq">{order.frequency || 'OD'}</span>
                            </div>
                            <div className="mam-rx-meta">
                                <span>Ordered by: <strong>{doctorName}</strong></span>
                                {order.instructions && <span>• Instructions: <em>{order.instructions}</em></span>}
                            </div>
                        </div>
                    </div>

                    {/* Administration Timing & Verifier */}
                    <div className="mam-timing-row">
                        <div className="mam-timing-box">
                            <span className="mam-t-lbl">Scheduled Time</span>
                            <span className="mam-t-val"><FiClock size={13} /> {scheduledTimeStr}</span>
                        </div>
                        <div className="mam-timing-box current">
                            <span className="mam-t-lbl">Actual Administration Time</span>
                            <span className="mam-t-val"><FiClock size={13} /> {currentTimeStr}</span>
                        </div>
                        <div className="mam-timing-box">
                            <span className="mam-t-lbl">Administering Nurse</span>
                            <span className="mam-t-val"><FiUser size={13} /> {currentNurseName || 'Staff Nurse'}</span>
                        </div>
                    </div>

                    {/* Action Selector */}
                    <div className="mam-action-tabs">
                        <button
                            type="button"
                            className={`mam-action-tab give ${selectedAction === 'GIVE' ? 'active' : ''}`}
                            onClick={() => { setSelectedAction('GIVE'); setErrorMsg(''); }}
                        >
                            <FiCheck size={14} /> Administered (Given)
                        </button>
                        <button
                            type="button"
                            className={`mam-action-tab hold ${selectedAction === 'HOLD' ? 'active' : ''}`}
                            onClick={() => { setSelectedAction('HOLD'); setErrorMsg(''); }}
                        >
                            <FiPause size={14} /> Hold Dose
                        </button>
                        <button
                            type="button"
                            className={`mam-action-tab refuse ${selectedAction === 'REFUSE' ? 'active' : ''}`}
                            onClick={() => { setSelectedAction('REFUSE'); setErrorMsg(''); }}
                        >
                            <FiAlertCircle size={14} /> Patient Refused
                        </button>
                        <button
                            type="button"
                            className={`mam-action-tab miss ${selectedAction === 'MISS' ? 'active' : ''}`}
                            onClick={() => { setSelectedAction('MISS'); setErrorMsg(''); }}
                        >
                            <FiAlertTriangle size={14} /> Missed Dose
                        </button>
                    </div>

                    {/* Conditional Fields based on action */}
                    {selectedAction === 'GIVE' ? (
                        <div className="mam-give-section">
                            <div className="mam-input-group">
                                <label>Clinical Administration Notes (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Tolerated well, IV site clean and patent, taken after light breakfast"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="mam-reason-section">
                            <div className="mam-input-group mandatory">
                                <label>
                                    Mandatory Reason for {selectedAction === 'HOLD' ? 'Holding' : selectedAction === 'REFUSE' ? 'Refusal' : 'Missed'} Dose *
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder={
                                        selectedAction === 'HOLD'
                                            ? 'e.g. Patient scheduled for OT / NPO, BP systolic < 90 mmHg, doctor advised temporary pause'
                                            : selectedAction === 'REFUSE'
                                            ? 'e.g. Patient refused injection stating nausea, doctor notified'
                                            : 'e.g. Patient away in radiology department during round'
                                    }
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="mam-input-group">
                                <label>Additional Nursing Observations (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Doctor notified via intercom at 10:15 AM"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Error Banner */}
                    {errorMsg && (
                        <div className="mam-error-banner">
                            <FiAlertCircle size={14} /> {errorMsg}
                        </div>
                    )}
                </div>

                {/* Modal Footer Actions */}
                <div className="mam-footer">
                    <button
                        type="button"
                        className="mam-cancel-btn"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>

                    {selectedAction === 'GIVE' && (
                        <button
                            type="button"
                            className="mam-submit-btn give"
                            onClick={() => handleSubmit('GIVE')}
                            disabled={submitting}
                        >
                            <FiCheck size={15} /> {submitting ? 'Confirming...' : 'Confirm Administered'}
                        </button>
                    )}

                    {selectedAction === 'HOLD' && (
                        <button
                            type="button"
                            className="mam-submit-btn hold"
                            onClick={() => handleSubmit('HOLD')}
                            disabled={submitting || !reason.trim()}
                        >
                            <FiPause size={15} /> {submitting ? 'Holding...' : 'Hold Medication Dose'}
                        </button>
                    )}

                    {selectedAction === 'REFUSE' && (
                        <button
                            type="button"
                            className="mam-submit-btn refuse"
                            onClick={() => handleSubmit('REFUSE')}
                            disabled={submitting || !reason.trim()}
                        >
                            <FiAlertCircle size={15} /> {submitting ? 'Recording...' : 'Record Patient Refused'}
                        </button>
                    )}

                    {selectedAction === 'MISS' && (
                        <button
                            type="button"
                            className="mam-submit-btn miss"
                            onClick={() => handleSubmit('MISS')}
                            disabled={submitting || !reason.trim()}
                        >
                            <FiAlertTriangle size={15} /> {submitting ? 'Recording...' : 'Record Missed Dose'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MedicationAdministrationModal;
