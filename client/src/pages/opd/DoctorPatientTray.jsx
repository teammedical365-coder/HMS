import React, { useState, useEffect, useCallback } from 'react';
import { freeOpdAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { downloadPrescriptionPdf } from '../../utils/prescriptionPdf';
import {
    FiActivity,
    FiClock,
    FiCheckCircle,
    FiUser,
    FiPlay,
    FiDownload,
    FiPlus,
    FiTrash2,
    FiAlertCircle,
    FiRefreshCw
} from 'react-icons/fi';
import './DoctorPatientTray.css';

const DoctorPatientTray = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { user } = useAuth();
    const { hospitalName } = useBranding();

    const [trayData, setTrayData] = useState({
        todayAppointments: [],
        waiting: [],
        inConsultation: [],
        completed: [],
        summary: { total: 0, waitingCount: 0, inConsultationCount: 0, completedCount: 0 }
    });
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Active Consultation Workspace state
    const [activeAppt, setActiveAppt] = useState(null);
    const [consultForm, setConsultForm] = useState({
        diagnosis: '',
        vitals: { bp: '', pulse: '', temp: '', weight: '', spo2: '' },
        medicines: [
            { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meal' }
        ],
        doctorNotes: '',
        followUpDate: ''
    });

    const loadTray = useCallback(async () => {
        setLoading(true);
        try {
            const res = await freeOpdAPI.getTodayTray();
            if (res.success) {
                setTrayData(res);
                // If there's an in-consultation patient, select the first one as active
                if (res.inConsultation?.length > 0) {
                    const first = res.inConsultation[0];
                    setActiveAppt(first);
                    setConsultForm({
                        diagnosis: first.diagnosis || '',
                        vitals: first.vitals || { bp: '', pulse: '', temp: '', weight: '', spo2: '' },
                        medicines: first.pharmacy?.length > 0
                            ? first.pharmacy
                            : [{ medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meal' }],
                        doctorNotes: first.doctorNotes || first.notes || '',
                        followUpDate: first.followUpDate ? first.followUpDate.split('T')[0] : ''
                    });
                } else {
                    setActiveAppt(null);
                }
            }
        } catch (err) {
            console.error('Error fetching today patient tray:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTray();
    }, [loadTray]);

    // Start Consultation
    const handleStartConsultation = async (appt) => {
        setActionLoading(true);
        try {
            const res = await freeOpdAPI.startConsultation(appt._id);
            if (res.success) {
                loadTray();
            }
        } catch (err) {
            alert('Failed to start consultation: ' + (err.response?.data?.message || err.message));
        } finally {
            setActionLoading(false);
        }
    };

    // Medicine builder handlers for Active Consultation
    const handleAddMedicine = () => {
        setConsultForm(prev => ({
            ...prev,
            medicines: [
                ...prev.medicines,
                { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meal' }
            ]
        }));
    };

    const handleRemoveMedicine = (idx) => {
        setConsultForm(prev => ({
            ...prev,
            medicines: prev.medicines.filter((_, i) => i !== idx)
        }));
    };

    const handleMedChange = (idx, field, val) => {
        setConsultForm(prev => {
            const copy = [...prev.medicines];
            copy[idx] = { ...copy[idx], [field]: val };
            return { ...prev, medicines: copy };
        });
    };

    // Complete Consultation & Save
    const handleCompleteConsultation = async (triggerDownload = false) => {
        if (!activeAppt) return;
        setActionLoading(true);

        const validMeds = consultForm.medicines.filter(m => m.medicineName && m.medicineName.trim());

        try {
            const payload = {
                diagnosis: consultForm.diagnosis.trim(),
                vitals: consultForm.vitals,
                pharmacy: validMeds,
                doctorNotes: consultForm.doctorNotes.trim(),
                followUpDate: consultForm.followUpDate || undefined
            };

            const res = await freeOpdAPI.completeConsultation(activeAppt._id, payload);
            if (res.success) {
                if (triggerDownload) {
                    downloadPrescriptionPdf({
                        clinic: {
                            name: hospitalName || user?.hospitalName || 'Doctor OPD Clinic',
                            address: user?.address || '',
                            city: user?.city || '',
                            phone: user?.phone || ''
                        },
                        doctor: {
                            name: user?.name || 'Doctor',
                            specialty: user?.specialty || user?.services?.[0] || 'OPD Practitioner',
                            qualification: user?.education || user?.qualification || 'MBBS',
                            phone: user?.phone || ''
                        },
                        patient: {
                            name: activeAppt.patientName,
                            phone: activeAppt.patientPhone,
                            patientUid: activeAppt.patientCode,
                            age: activeAppt.userId?.age || activeAppt.clinicPatientId?.age,
                            gender: activeAppt.userId?.gender || activeAppt.clinicPatientId?.gender
                        },
                        prescription: {
                            medicines: validMeds,
                            diagnosis: consultForm.diagnosis,
                            doctorNotes: consultForm.doctorNotes,
                            vitals: consultForm.vitals,
                            followUpDate: consultForm.followUpDate
                        },
                        diagnosis: consultForm.diagnosis,
                        notes: consultForm.doctorNotes,
                        followUpDate: consultForm.followUpDate,
                        date: new Date()
                    });
                }

                loadTray();
            }
        } catch (err) {
            alert('Failed to complete consultation: ' + (err.response?.data?.message || err.message));
        } finally {
            setActionLoading(false);
        }
    };

    // Cancel Appointment
    const handleCancel = async (apptId) => {
        const reason = prompt('Reason for cancelling this appointment:');
        if (reason === null) return;
        setActionLoading(true);
        try {
            const res = await freeOpdAPI.cancelAppointment(apptId, reason || 'Cancelled by doctor');
            if (res.success) {
                loadTray();
            }
        } catch (err) {
            alert('Error cancelling: ' + (err.response?.data?.message || err.message));
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="dpt-container">
            {/* KPI Cards */}
            <div className="dpt-kpi-grid">
                <div className="dpt-kpi-card">
                    <div>
                        <div className="dpt-kpi-num">{trayData.summary?.total || 0}</div>
                        <div className="dpt-kpi-label">Today's Total Appts</div>
                    </div>
                    <div className="dpt-kpi-icon" style={{ color: '#0284c7' }}>📅</div>
                </div>

                <div className="dpt-kpi-card">
                    <div>
                        <div className="dpt-kpi-num" style={{ color: '#b45309' }}>
                            {trayData.waiting?.length || 0}
                        </div>
                        <div className="dpt-kpi-label">Waiting Patients</div>
                    </div>
                    <div className="dpt-kpi-icon" style={{ color: '#d97706' }}>⏳</div>
                </div>

                <div className="dpt-kpi-card">
                    <div>
                        <div className="dpt-kpi-num" style={{ color: '#0d9488' }}>
                            {trayData.inConsultation?.length || 0}
                        </div>
                        <div className="dpt-kpi-label">In Consultation</div>
                    </div>
                    <div className="dpt-kpi-icon" style={{ color: '#14b8a6' }}>🩺</div>
                </div>

                <div className="dpt-kpi-card">
                    <div>
                        <div className="dpt-kpi-num" style={{ color: '#059669' }}>
                            {trayData.completed?.length || 0}
                        </div>
                        <div className="dpt-kpi-label">Completed Consults</div>
                    </div>
                    <div className="dpt-kpi-icon" style={{ color: '#10b981' }}>✅</div>
                </div>
            </div>

            {/* 3-Column Patient Tray View */}
            <div className="dpt-tray-grid">
                {/* ─────────────────────────────────────────────────────────────
                   COLUMN 1: WAITING QUEUE
                   ───────────────────────────────────────────────────────────── */}
                <div className="dpt-column">
                    <div className="dpt-column-header">
                        <div className="dpt-column-title">
                            <span>⏳</span>
                            <span>Waiting Queue</span>
                        </div>
                        <span className="dpt-column-badge dpt-badge-waiting">
                            {trayData.waiting?.length || 0}
                        </span>
                    </div>

                    {trayData.waiting?.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b', fontSize: '13px' }}>
                            No patients currently waiting.
                        </div>
                    ) : (
                        trayData.waiting.map((appt) => (
                            <div key={appt._id} className="dpt-patient-card">
                                <div className="dpt-card-top">
                                    <span className="dpt-patient-name">{appt.patientName}</span>
                                    <span className="dpt-patient-time">{appt.appointmentTime || 'Today'}</span>
                                </div>
                                <div className="dpt-patient-meta">
                                    <span>UID: {appt.patientCode}</span>
                                    {appt.patientPhone && <span> • Ph: {appt.patientPhone}</span>}
                                    {appt.amount > 0 && <span> • Fee: ₹{appt.amount}</span>}
                                </div>

                                <div className="dpt-card-actions">
                                    <button
                                        type="button"
                                        className="dpt-btn-start"
                                        onClick={() => handleStartConsultation(appt)}
                                        disabled={actionLoading}
                                    >
                                        <FiPlay />
                                        <span>Start Consultation</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="dpt-btn-cancel"
                                        title="Cancel Appointment"
                                        onClick={() => handleCancel(appt._id)}
                                        disabled={actionLoading}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* ─────────────────────────────────────────────────────────────
                   COLUMN 2: IN CONSULTATION (Clinical Workspace)
                   ───────────────────────────────────────────────────────────── */}
                <div className="dpt-column">
                    <div className="dpt-column-header">
                        <div className="dpt-column-title">
                            <span>🩺</span>
                            <span>In Consultation</span>
                        </div>
                        <span className="dpt-column-badge dpt-badge-active">
                            {trayData.inConsultation?.length || 0} Active
                        </span>
                    </div>

                    {!activeAppt ? (
                        <div style={{ textAlign: 'center', padding: '60px 10px', color: '#64748b' }}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>👨‍⚕️</div>
                            <p style={{ margin: 0, fontSize: '13.5px' }}>
                                No patient in active consultation.<br />Click <strong>Start Consultation</strong> on a waiting patient to begin.
                            </p>
                        </div>
                    ) : (
                        <div className="dpt-active-workspace">
                            <div className="dpt-active-patient-header">
                                <div>
                                    <div className="dpt-active-name">{activeAppt.patientName}</div>
                                    <div style={{ fontSize: '12px', color: '#0f766e', marginTop: '2px' }}>
                                        UID: {activeAppt.patientCode} • Ph: {activeAppt.patientPhone || 'N/A'}
                                    </div>
                                </div>
                                <span style={{ fontSize: '11px', background: '#ccfbf1', color: '#0f766e', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                    Active Now
                                </span>
                            </div>

                            {/* Diagnosis & Vitals */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '12px' }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                        Diagnosis *
                                    </label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                                        placeholder="e.g. Acute Gastroenteritis"
                                        value={consultForm.diagnosis}
                                        onChange={(e) => setConsultForm({ ...consultForm, diagnosis: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                        BP (mmHg)
                                    </label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px' }}
                                        placeholder="120/80"
                                        value={consultForm.vitals.bp}
                                        onChange={(e) => setConsultForm({ ...consultForm, vitals: { ...consultForm.vitals, bp: e.target.value } })}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                        Pulse (bpm)
                                    </label>
                                    <input
                                        type="text"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px' }}
                                        placeholder="72"
                                        value={consultForm.vitals.pulse}
                                        onChange={(e) => setConsultForm({ ...consultForm, vitals: { ...consultForm.vitals, pulse: e.target.value } })}
                                    />
                                </div>
                            </div>

                            {/* Medicines List */}
                            {/* Medicines List with Dose, Frequency, Duration, Meal Timing */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                                    Prescribed Medicines
                                </label>
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                    {consultForm.medicines.length} Medicine{consultForm.medicines.length > 1 ? 's' : ''}
                                </span>
                            </div>

                            {consultForm.medicines.map((m, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        padding: '10px',
                                        marginBottom: '8px'
                                    }}
                                >
                                    {/* Medicine Name & Delete */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            style={{
                                                flex: 1,
                                                boxSizing: 'border-box',
                                                padding: '7px 10px',
                                                border: '1px solid #cbd5e1',
                                                borderRadius: '6px',
                                                fontSize: '12.5px',
                                                fontWeight: 600,
                                                background: '#ffffff'
                                            }}
                                            placeholder={`Medicine #${idx + 1} Name (e.g. Paracetamol 650mg, Amoxicillin...)`}
                                            value={m.medicineName}
                                            onChange={(e) => handleMedChange(idx, 'medicineName', e.target.value)}
                                        />
                                        {consultForm.medicines.length > 1 && (
                                            <button
                                                type="button"
                                                style={{
                                                    background: '#fee2e2',
                                                    border: '1px solid #fecaca',
                                                    color: '#ef4444',
                                                    cursor: 'pointer',
                                                    padding: '6px 8px',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}
                                                title="Remove Medicine"
                                                onClick={() => handleRemoveMedicine(idx)}
                                            >
                                                <FiTrash2 style={{ fontSize: '14px' }} />
                                            </button>
                                        )}
                                    </div>

                                    {/* 4 Dropdowns Grid: Dose, Frequency, Duration, Meal Timing */}
                                    <div className="dpt-med-dropdowns-grid">
                                        {/* 1. Kitne doge (Dose / Quantity) */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                                Dose
                                            </label>
                                            <select
                                                style={{
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '5px 6px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    background: '#ffffff',
                                                    color: '#0f172a'
                                                }}
                                                value={m.dosage || '1 tab'}
                                                onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                                            >
                                                <option value="1 tab">1 tab</option>
                                                <option value="2 tabs">2 tabs</option>
                                                <option value="1/2 tab">1/2 tab</option>
                                                <option value="1 cap">1 capsule</option>
                                                <option value="2 caps">2 capsules</option>
                                                <option value="1 tsp (5ml)">1 tsp (5ml)</option>
                                                <option value="2 tsp (10ml)">2 tsp (10ml)</option>
                                                <option value="1 puff">1 puff</option>
                                                <option value="2 puffs">2 puffs</option>
                                                <option value="1 drop">1 drop</option>
                                                <option value="2 drops">2 drops</option>
                                                <option value="1 sachet">1 sachet</option>
                                                <option value="1 inj">1 injection</option>
                                            </select>
                                        </div>

                                        {/* 2. Frequency*/}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                                Frequency
                                            </label>
                                            <select
                                                style={{
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '5px 6px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    background: '#ffffff',
                                                    color: '#0f172a'
                                                }}
                                                value={m.frequency || '1-0-1'}
                                                onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                                            >
                                                <option value="1-0-1">1-0-1</option>
                                                <option value="1-1-1">1-1-1</option>
                                                <option value="1-0-0">1-0-0</option>
                                                <option value="0-0-1">0-0-1</option>
                                                <option value="0-1-0">0-1-0</option>
                                                <option value="1-1-1-1">1-1-1-1</option>
                                                <option value="SOS">SOS</option>
                                            </select>
                                        </div>

                                        {/* 3. Kitne din ka hai (Duration / कितने दिन) */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                                Duration
                                            </label>
                                            <select
                                                style={{
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '5px 6px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    background: '#ffffff',
                                                    color: '#0f172a'
                                                }}
                                                value={m.duration || '5 days'}
                                                onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                                            >
                                                <option value="3 days">3 Days </option>
                                                <option value="5 days">5 Days </option>
                                                <option value="7 days">7 Days </option>
                                                <option value="10 days">10 Days</option>
                                                <option value="14 days">14 Days </option>
                                                <option value="15 days">15 Days</option>
                                                <option value="30 days">1 Month</option>
                                                <option value="1 day">1 Day</option>
                                                <option value="As needed">As needed</option>
                                            </select>
                                        </div>

                                        {/* 4. Meal Timing (After meal / Before meal) */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                                Meal Timing
                                            </label>
                                            <select
                                                style={{
                                                    width: '100%',
                                                    boxSizing: 'border-box',
                                                    padding: '5px 6px',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    fontSize: '11.5px',
                                                    background: '#ffffff',
                                                    color: '#0f172a'
                                                }}
                                                value={m.instructions || 'After meal'}
                                                onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                                            >
                                                <option value="After meal">After meal </option>
                                                <option value="Before meal">Before meal </option>
                                                <option value="With meal">With meal </option>
                                                <option value="At bedtime">At bedtime </option>
                                                <option value="Empty stomach">Empty stomach </option>
                                                <option value="As directed">As directed </option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button
                                type="button"
                                style={{
                                    background: '#ffffff',
                                    border: '1px dashed #0d9488',
                                    color: '#0d9488',
                                    padding: '7px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    width: '100%',
                                    margin: '4px 0 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                                onClick={handleAddMedicine}
                            >
                                <FiPlus />
                                <span>Add Another Medicine</span>
                            </button>

                            {/* Advice & Revisit Date */}
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Clinical Advice / Notes
                                </label>
                                <textarea
                                    rows="2"
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                    placeholder="e.g. Adequate hydration, avoid fried foods."
                                    value={consultForm.doctorNotes}
                                    onChange={(e) => setConsultForm({ ...consultForm, doctorNotes: e.target.value })}
                                />
                            </div>

                            {/* Next Revisit / Follow-up Date */}
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                                        Next Revisit / Follow-up Date
                                    </label>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                            type="button"
                                            style={{ fontSize: '10.5px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                            onClick={() => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + 3);
                                                setConsultForm(prev => ({ ...prev, followUpDate: d.toISOString().split('T')[0] }));
                                            }}
                                        >
                                            +3 Days
                                        </button>
                                        <button
                                            type="button"
                                            style={{ fontSize: '10.5px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                            onClick={() => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + 7);
                                                setConsultForm(prev => ({ ...prev, followUpDate: d.toISOString().split('T')[0] }));
                                            }}
                                        >
                                            +1 Week
                                        </button>
                                        <button
                                            type="button"
                                            style={{ fontSize: '10.5px', padding: '2px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                                            onClick={() => {
                                                const d = new Date();
                                                d.setDate(d.getDate() + 14);
                                                setConsultForm(prev => ({ ...prev, followUpDate: d.toISOString().split('T')[0] }));
                                            }}
                                        >
                                            +2 Weeks
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="date"
                                    min={todayStr}
                                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                    value={consultForm.followUpDate}
                                    onChange={(e) => setConsultForm({ ...consultForm, followUpDate: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    type="button"
                                    style={{ flex: 1, background: '#14b8a6', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                                    disabled={actionLoading}
                                    onClick={() => handleCompleteConsultation(false)}
                                >
                                    {actionLoading ? 'Saving...' : '✓ Complete Consultation'}
                                </button>
                                <button
                                    type="button"
                                    style={{ flex: 1, background: '#0284c7', color: '#ffffff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                    disabled={actionLoading}
                                    onClick={() => handleCompleteConsultation(true)}
                                >
                                    <FiDownload />
                                    <span>Complete & Download Rx 📄</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ─────────────────────────────────────────────────────────────
                   COLUMN 3: COMPLETED CONSULTATIONS
                   ───────────────────────────────────────────────────────────── */}
                <div className="dpt-column">
                    <div className="dpt-column-header">
                        <div className="dpt-column-title">
                            <span>✅</span>
                            <span>Completed Today</span>
                        </div>
                        <span className="dpt-column-badge dpt-badge-completed">
                            {trayData.completed?.length || 0}
                        </span>
                    </div>

                    {trayData.completed?.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b', fontSize: '13px' }}>
                            No completed consultations yet today.
                        </div>
                    ) : (
                        trayData.completed.map((appt) => (
                            <div key={appt._id} className="dpt-patient-card" style={{ background: '#ffffff' }}>
                                <div className="dpt-card-top">
                                    <span className="dpt-patient-name">{appt.patientName}</span>
                                    <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#059669', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                        Done
                                    </span>
                                </div>
                                <div className="dpt-patient-meta">
                                    <span>UID: {appt.patientCode}</span>
                                    {appt.diagnosis && <span> • <strong>{appt.diagnosis}</strong></span>}
                                    {appt.pharmacy?.length > 0 && <span> • {appt.pharmacy.length} Meds</span>}
                                </div>

                                <button
                                    type="button"
                                    style={{ background: '#f0fdfa', border: '1px solid #99f6e4', color: '#0d9488', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                    onClick={() => {
                                        downloadPrescriptionPdf({
                                            clinic: {
                                                name: hospitalName || user?.hospitalName || 'Doctor OPD Clinic',
                                                address: user?.address || '',
                                                city: user?.city || '',
                                                phone: user?.phone || ''
                                            },
                                            doctor: {
                                                name: user?.name || 'Doctor',
                                                specialty: user?.specialty || user?.services?.[0] || 'OPD Practitioner',
                                                qualification: user?.education || user?.qualification || 'MBBS',
                                                phone: user?.phone || ''
                                            },
                                            patient: {
                                                name: appt.patientName,
                                                phone: appt.patientPhone,
                                                patientUid: appt.patientCode,
                                                age: appt.userId?.age || appt.clinicPatientId?.age,
                                                gender: appt.userId?.gender || appt.clinicPatientId?.gender
                                            },
                                            prescription: {
                                                medicines: appt.pharmacy || [],
                                                diagnosis: appt.diagnosis,
                                                doctorNotes: appt.doctorNotes || appt.notes,
                                                vitals: appt.vitals,
                                                followUpDate: appt.followUpDate
                                            },
                                            diagnosis: appt.diagnosis,
                                            notes: appt.doctorNotes || appt.notes,
                                            date: appt.appointmentDate
                                        });
                                    }}
                                >
                                    <FiDownload />
                                    <span>Download Rx PDF</span>
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default DoctorPatientTray;

