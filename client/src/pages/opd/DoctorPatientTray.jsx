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
            { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }
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
                            : [{ medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }],
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
                { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }
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
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Prescribed Medicines
                            </label>
                            {consultForm.medicines.map((m, idx) => (
                                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        style={{ boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                        placeholder="Medicine name"
                                        value={m.medicineName}
                                        onChange={(e) => handleMedChange(idx, 'medicineName', e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        style={{ boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                        placeholder="Dosage"
                                        value={m.dosage}
                                        onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        style={{ boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px' }}
                                        placeholder="Frequency"
                                        value={m.frequency}
                                        onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                                    />
                                    {consultForm.medicines.length > 1 && (
                                        <button
                                            type="button"
                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                            onClick={() => handleRemoveMedicine(idx)}
                                        >
                                            <FiTrash2 />
                                        </button>
                                    )}
                                </div>
                            ))}

                            <button
                                type="button"
                                style={{ background: '#ffffff', border: '1px dashed #cbd5e1', color: '#0d9488', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', width: '100%', margin: '6px 0 12px' }}
                                onClick={handleAddMedicine}
                            >
                                + Add Another Medicine
                            </button>

                            {/* Advice & Revisit Date */}
                            <div style={{ marginBottom: '14px' }}>
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

