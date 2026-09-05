import React from 'react';
import { FiEye, FiCalendar, FiClock, FiPlus, FiX, FiDollarSign, FiCheck, FiAlertTriangle } from 'react-icons/fi';

export const getStatusStyle = (status) => {
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

export const getElapsedTime = (startTime) => {
    if (!startTime) return null;
    const start = new Date(startTime);
    const now = new Date();
    const diffMs = now - start;
    if (diffMs < 0) return '0m';
    const mins = Math.floor(diffMs / 60000);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remMins}m`;
    return `${mins}m`;
};

export const checkIfDelayed = (surgery) => {
    if (!surgery || !surgery.startTime || surgery.status !== 'SCHEDULED') return false;
    const today = new Date().toISOString().split('T')[0];
    const surgeryDate = surgery.surgeryDate ? new Date(surgery.surgeryDate).toISOString().split('T')[0] : today;
    if (surgeryDate !== today) return false;

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours * 60 + currentMinutes;

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

// ==========================================
// 1. SURGERY VIEW DETAILS MODAL
// ==========================================
export const SurgeryDetailsModal = ({ open, surgery, onClose, onOpenScheduleModal }) => {
    if (!open || !surgery) return null;
    const s = surgery;
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
                    <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>×</button>
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
                        <button onClick={onClose} style={{ padding: '9px 18px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
                            Close
                        </button>
                        {s.status === 'PLANNED' && onOpenScheduleModal && (
                            <button
                                onClick={() => {
                                    onClose();
                                    onOpenScheduleModal(s);
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
};

// ==========================================
// 2. SCHEDULE SURGERY MODAL
// ==========================================
export const ScheduleSurgeryModal = ({ 
    open, 
    activePlan, 
    onClose, 
    doctorsList = [], 
    otRoomsList = [], 
    onSuccess 
}) => {
    if (!open || !activePlan) return null;

    const [selectedAssistantToAdd, setSelectedAssistantToAdd] = React.useState('');
    const [scheduling, setScheduling] = React.useState(false);
    const [scheduleError, setScheduleError] = React.useState('');

    const initialSurgeonId = activePlan.surgeonId 
        ? (typeof activePlan.surgeonId === 'object' ? (activePlan.surgeonId._id || '') : activePlan.surgeonId)
        : (activePlan.doctorId ? (typeof activePlan.doctorId === 'object' ? (activePlan.doctorId._id || '') : activePlan.doctorId) : '');

    const initialAssistants = Array.isArray(activePlan.assistantSurgeonIds) 
        ? activePlan.assistantSurgeonIds.map(as => typeof as === 'object' ? as._id : as).filter(Boolean)
        : [];

    const [form, setForm] = React.useState({
        otRoomId: activePlan.otRoomId ? (typeof activePlan.otRoomId === 'object' ? activePlan.otRoomId._id : activePlan.otRoomId) : '',
        surgeryDate: activePlan.preferredDate ? new Date(activePlan.preferredDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '12:00',
        surgeonId: initialSurgeonId,
        assistantSurgeonIds: initialAssistants,
        surgeryCost: activePlan.surgeryCost || 0,
        priority: activePlan.priority || 'Normal',
        notes: activePlan.notes || ''
    });

    const handleAddAssistant = () => {
        if (!selectedAssistantToAdd) return;
        if (selectedAssistantToAdd === form.surgeonId) {
            setScheduleError('The Operating Surgeon cannot also be added as an Assistant.');
            return;
        }
        if (form.assistantSurgeonIds.includes(selectedAssistantToAdd)) {
            setScheduleError('This assistant doctor is already added.');
            return;
        }
        setScheduleError('');
        setForm(prev => ({
            ...prev,
            assistantSurgeonIds: [...prev.assistantSurgeonIds, selectedAssistantToAdd]
        }));
        setSelectedAssistantToAdd('');
    };

    const handleRemoveAssistant = (docId) => {
        setForm(prev => ({
            ...prev,
            assistantSurgeonIds: prev.assistantSurgeonIds.filter(id => id !== docId)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.otRoomId || !form.surgeryDate || !form.startTime || !form.endTime || !form.surgeonId) {
            setScheduleError('Please fill all required fields (OT Room, Date, Time, Operating Surgeon)');
            return;
        }
        if (form.startTime >= form.endTime) {
            setScheduleError('End time must be after start time');
            return;
        }
        setScheduling(true);
        setScheduleError('');
        try {
            const { otAPI } = await import('../../utils/api');
            const res = await otAPI.scheduleSurgery(activePlan._id, form);
            if (res.success) {
                onClose();
                if (onSuccess) onSuccess();
            }
        } catch (err) {
            console.error('Scheduling error:', err);
            setScheduleError(err.response?.data?.message || 'Failed to schedule surgery');
        } finally {
            setScheduling(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '540px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', fontWeight: 800 }}>
                            📅 Schedule OT Surgery
                        </h3>
                        <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Plan: {activePlan.planId || activePlan._id}
                        </span>
                    </div>
                    <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {scheduleError && (
                        <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600 }}>
                            ⚠️ {scheduleError}
                        </div>
                    )}

                    {/* Auto-carried Summary */}
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginBottom: '2px' }}>
                            PROCEDURE & PATIENT (AUTO-CARRIED)
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>
                            {activePlan.surgery}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: '3px' }}>
                            👤 <strong>{activePlan.patientId?.name || 'Patient'}</strong> [MRN: {activePlan.patientId?.mrn || activePlan.patientId?.patientId || '-'}]
                        </div>
                        {activePlan.diagnosis && (
                            <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                                Diagnosis: {activePlan.diagnosis}
                            </div>
                        )}
                    </div>

                    {/* Operating Surgeon */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            Operating Surgeon (Primary) *
                        </label>
                        <select
                            required
                            value={form.surgeonId}
                            onChange={e => {
                                const newSurgeonId = e.target.value;
                                setForm(prev => ({
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

                    {/* Surgical Assistants */}
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
                                    .filter(doc => doc._id !== form.surgeonId && !form.assistantSurgeonIds.includes(doc._id))
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

                        {form.assistantSurgeonIds.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                                {form.assistantSurgeonIds.map(docId => {
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

                    {/* OT Room */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            Assign OT Room *
                        </label>
                        <select
                            required
                            value={form.otRoomId}
                            onChange={e => setForm(prev => ({ ...prev, otRoomId: e.target.value }))}
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
                            value={form.surgeryDate}
                            onChange={e => setForm(prev => ({ ...prev, surgeryDate: e.target.value }))}
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
                                value={form.startTime}
                                onChange={e => setForm(prev => ({ ...prev, startTime: e.target.value }))}
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
                                value={form.endTime}
                                onChange={e => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.9rem', color: '#0f172a', boxSizing: 'border-box' }}
                            />
                        </div>
                    </div>

                    {/* Priority & Surgery Cost */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Priority
                            </label>
                            <select
                                value={form.priority}
                                onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))}
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
                                value={form.surgeryCost}
                                onChange={e => setForm(prev => ({ ...prev, surgeryCost: e.target.value }))}
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
                            value={form.notes}
                            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.88rem', color: '#0f172a', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                        <button
                            type="button"
                            onClick={onClose}
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
    );
};

// ==========================================
// 3. WORKFLOW BED MODAL (ADMIT / TRANSFER)
// ==========================================
export const WorkflowBedModal = ({ open, actionType, patientId, surgeryId, onClose, onSuccess }) => {
    if (!open) return null;
    const [beds, setBeds] = React.useState([]);
    const [selectedBedId, setSelectedBedId] = React.useState('');
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchBeds = async () => {
            try {
                const { bedAPI } = await import('../../utils/api');
                const res = await bedAPI.getBeds({ status: 'AVAILABLE' });
                if (res.success) setBeds(res.beds || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchBeds();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedBedId) return alert('Please select a bed');
        try {
            const { admissionAPI, otAPI } = await import('../../utils/api');
            const targetBed = beds.find(b => b._id === selectedBedId);
            if (actionType === 'ADMIT') {
                await admissionAPI.createAdmission({
                    patientId,
                    bedId: selectedBedId,
                    ward: targetBed?.ward,
                    admissionDate: new Date().toISOString().split('T')[0],
                    admissionTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                    notes: 'Pre-Op Admission for Surgery'
                });
                await otAPI.updateSurgeryWorkflow(surgeryId, { status: 'ADMITTED' });
            } else if (actionType === 'TRANSFER') {
                const actAdmRes = await admissionAPI.getPatientAdmissions(patientId);
                const activeAdm = actAdmRes.admissions?.find(a => a.status === 'Admitted');
                if (activeAdm) {
                    await admissionAPI.transferBed(activeAdm._id, {
                        newWard: targetBed?.ward,
                        newBedId: selectedBedId,
                        transferDate: new Date().toISOString().split('T')[0],
                        transferTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                        notes: 'Post-Op Ward Transfer'
                    });
                    await otAPI.updateSurgeryWorkflow(surgeryId, { status: 'POST_OP' });
                } else {
                    alert('No active admission found for this patient to transfer');
                    return;
                }
            }
            onClose();
            if (onSuccess) onSuccess();
        } catch (err) {
            alert(err.response?.data?.message || 'Action failed');
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '440px', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem', fontWeight: 700 }}>
                        {actionType === 'ADMIT' ? '🏥 Admit Patient' : '🔄 Transfer Bed'}
                    </h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}>×</button>
                </div>
                <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Select Available Bed *</label>
                            <select required value={selectedBedId} onChange={e => setSelectedBedId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', color: '#0f172a', fontSize: '0.92rem' }}>
                                <option value="">-- Choose Bed --</option>
                                {beds.map(b => <option key={b._id} value={b._id}>{b.ward} - Bed {b.bedNumber} ({b.bedType})</option>)}
                            </select>
                            {selectedBedId && (() => {
                                const targetBed = beds.find(b => b._id === selectedBedId);
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
                        <button type="button" onClick={onClose} style={{ padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>Confirm</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
