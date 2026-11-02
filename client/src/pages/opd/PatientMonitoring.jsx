import React, { useState, useEffect, useCallback } from 'react';
import { freeOpdAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { useBranding } from '../../context/BrandingContext';
import { downloadPrescriptionPdf } from '../../utils/prescriptionPdf';
import {
    FiSearch,
    FiUserPlus,
    FiFileText,
    FiDownload,
    FiX,
    FiPlus,
    FiTrash2,
    FiCalendar,
    FiActivity,
    FiCheckCircle,
    FiAlertCircle
} from 'react-icons/fi';
import './PatientMonitoring.css';

const PatientMonitoring = () => {
    const { user } = useAuth();
    const { hospitalName } = useBranding();

    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [totalCount, setTotalCount] = useState(0);

    // Modals
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [patientDetails, setPatientDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [profileTab, setProfileTab] = useState('overview'); // 'overview', 'history', 'prescribe'

    // Register Form State
    const [regForm, setRegForm] = useState({
        name: '',
        phone: '',
        age: '',
        gender: 'Male',
        bloodGroup: '',
        address: '',
        allergies: '',
        chronicConditions: '',
        medicalNotes: '',
        email: ''
    });
    const [regError, setRegError] = useState('');
    const [registering, setRegistering] = useState(false);

    // Prescribe Form State inside Patient Profile
    const [rxForm, setRxForm] = useState({
        diagnosis: '',
        vitals: { bp: '', pulse: '', temp: '', weight: '', spo2: '' },
        medicines: [
            { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }
        ],
        doctorNotes: '',
        followUpDate: ''
    });
    const [savingRx, setSavingRx] = useState(false);
    const [rxNotice, setRxNotice] = useState('');

    // Fetch Patients
    const loadPatients = useCallback(async (query = '') => {
        setLoading(true);
        try {
            const res = await freeOpdAPI.searchPatients({ query, page: 1, limit: 50 });
            if (res.success) {
                setPatients(res.patients || []);
                setTotalCount(res.total || res.patients?.length || 0);
            }
        } catch (err) {
            console.error('Error searching patients:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPatients();
    }, [loadPatients]);

    const handleSearch = (e) => {
        const val = e.target.value;
        setSearchQuery(val);
        const timer = setTimeout(() => {
            loadPatients(val);
        }, 300);
        return () => clearTimeout(timer);
    };

    // Open Patient Profile
    const openPatientProfile = async (patientId) => {
        setSelectedPatientId(patientId);
        setLoadingDetails(true);
        setProfileTab('overview');
        setRxNotice('');
        try {
            const res = await freeOpdAPI.getPatientOverview(patientId);
            if (res.success) {
                setPatientDetails(res);
                // Pre-fill latest vitals if available
                if (res.vitals) {
                    setRxForm(prev => ({ ...prev, vitals: { ...prev.vitals, ...res.vitals } }));
                }
            }
        } catch (err) {
            console.error('Error fetching patient profile:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    const closeProfileModal = () => {
        setSelectedPatientId(null);
        setPatientDetails(null);
        setRxNotice('');
    };

    // Register Patient Personally
    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setRegError('');
        if (!regForm.name.trim() || regForm.name.trim().length < 2) {
            setRegError('Patient full name is required (min 2 characters)');
            return;
        }
        const cleanedPhone = regForm.phone.replace(/\D/g, '').slice(-10);
        if (cleanedPhone.length !== 10) {
            setRegError('Valid 10-digit mobile number is required');
            return;
        }

        const cleanEmail = regForm.email && regForm.email.trim() ? regForm.email.trim().toLowerCase() : undefined;
        if (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
            setRegError('Please enter a valid email address');
            return;
        }

        let ageNum = undefined;
        if (regForm.age !== '' && regForm.age !== null && regForm.age !== undefined) {
            ageNum = Number(regForm.age);
            if (isNaN(ageNum) || ageNum < 1 || ageNum > 125) {
                setRegError('Please enter a valid age between 1 and 125 years');
                return;
            }
        }

        setRegistering(true);
        try {
            const payload = {
                ...regForm,
                name: regForm.name.trim(),
                phone: cleanedPhone,
                email: cleanEmail,
                age: ageNum
            };
            const res = await freeOpdAPI.registerPatient(payload);
            if (res.success) {
                setShowRegisterModal(false);
                setRegForm({
                    name: '',
                    phone: '',
                    age: '',
                    gender: 'Male',
                    bloodGroup: '',
                    address: '',
                    allergies: '',
                    chronicConditions: '',
                    medicalNotes: '',
                    email: ''
                });
                loadPatients();
                // Immediately open profile for the newly registered patient
                if (res.patient?._id) {
                    openPatientProfile(res.patient._id);
                }
            } else {
                setRegError(res.message || 'Registration failed');
            }
        } catch (err) {
            setRegError(err.response?.data?.message || err.message || 'Error registering patient');
        } finally {
            setRegistering(false);
        }
    };

    // Medicine Builder Handlers
    const handleAddMedicine = () => {
        setRxForm(prev => ({
            ...prev,
            medicines: [
                ...prev.medicines,
                { medicineName: '', dosage: '1 tab', frequency: '1-0-1', duration: '5 days', instructions: 'After meals' }
            ]
        }));
    };

    const handleRemoveMedicine = (index) => {
        setRxForm(prev => ({
            ...prev,
            medicines: prev.medicines.filter((_, idx) => idx !== index)
        }));
    };

    const handleMedChange = (index, field, value) => {
        setRxForm(prev => {
            const updated = [...prev.medicines];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, medicines: updated };
        });
    };

    // Save & Download Prescription
    const handleSavePrescription = async (triggerDownload = false) => {
        if (!patientDetails?.patient?._id) return;
        setSavingRx(true);
        setRxNotice('');

        const validMeds = rxForm.medicines.filter(m => m.medicineName && m.medicineName.trim());

        try {
            const payload = {
                patientId: patientDetails.patient._id,
                diagnosis: rxForm.diagnosis.trim(),
                vitals: rxForm.vitals,
                medicines: validMeds,
                doctorNotes: rxForm.doctorNotes.trim(),
                followUpDate: rxForm.followUpDate || undefined
            };

            const res = await freeOpdAPI.savePrescription(payload);
            if (res.success) {
                setRxNotice('✓ Prescription recorded successfully');

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
                        patient: patientDetails.patient,
                        prescription: {
                            medicines: validMeds,
                            diagnosis: rxForm.diagnosis,
                            doctorNotes: rxForm.doctorNotes,
                            vitals: rxForm.vitals,
                            followUpDate: rxForm.followUpDate
                        },
                        diagnosis: rxForm.diagnosis,
                        notes: rxForm.doctorNotes,
                        followUpDate: rxForm.followUpDate,
                        date: new Date()
                    });
                }

                // Refresh patient profile to show the new consultation in history
                openPatientProfile(patientDetails.patient._id);
            }
        } catch (err) {
            setRxNotice('Failed to save prescription: ' + (err.response?.data?.message || err.message));
        } finally {
            setSavingRx(false);
        }
    };

    return (
        <div className="pm-container">
            {/* Action Bar */}
            <div className="pm-controls-bar">
                <div className="pm-search-box">
                    <FiSearch style={{ color: '#94a3b8' }} />
                    <input
                        type="text"
                        className="pm-search-input"
                        placeholder="Search patients by Name, Mobile, or Patient UID..."
                        value={searchQuery}
                        onChange={handleSearch}
                    />
                </div>

                <button
                    type="button"
                    className="pm-action-btn-primary"
                    onClick={() => {
                        setRegError('');
                        setShowRegisterModal(true);
                    }}
                >
                    <FiUserPlus />
                    <span>Register New Patient</span>
                </button>
            </div>

            {/* Patients Master Table */}
            <div className="pm-table-card">
                <div className="pm-table-responsive">
                    <table className="pm-table">
                        <thead>
                            <tr>
                                <th>Patient UID</th>
                                <th>Full Name</th>
                                <th>Mobile</th>
                                <th>Age / Gender</th>
                                <th>Blood Group</th>
                                <th>Registered Date</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="pm-empty-state">
                                        Loading registered patients...
                                    </td>
                                </tr>
                            ) : patients.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="pm-empty-state">
                                        <div className="pm-empty-icon">👥</div>
                                        <p>No patients found. Click <strong>Register New Patient</strong> to add your first patient.</p>
                                    </td>
                                </tr>
                            ) : (
                                patients.map((p) => {
                                    const regDate = p.createdAt 
                                        ? new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : '—';
                                    const ageGen = [p.age ? `${p.age} Yrs` : null, p.gender].filter(Boolean).join(' / ') || '—';
                                    return (
                                        <tr key={p._id}>
                                            <td>
                                                <span className="pm-patient-id-badge">
                                                    {p.patientId || p.patientUid || 'OPD-N/A'}
                                                </span>
                                            </td>
                                            <td>
                                                <strong>{p.name}</strong>
                                            </td>
                                            <td>{p.phone || '—'}</td>
                                            <td>{ageGen}</td>
                                            <td>{p.bloodGroup || '—'}</td>
                                            <td>{regDate}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button
                                                    type="button"
                                                    className="pm-view-btn"
                                                    onClick={() => openPatientProfile(p._id)}
                                                >
                                                    <FiFileText />
                                                    <span>Open Profile</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
               REGISTER NEW PATIENT PERSONALLY (Modal)
               ───────────────────────────────────────────────────────────── */}
            {showRegisterModal && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card" role="dialog" aria-modal="true" data-scrollable="true">
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Register New Patient</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={() => setShowRegisterModal(false)}
                            >
                                <FiX />
                            </button>
                        </div>

                        <form onSubmit={handleRegisterSubmit}>
                            <div className="pm-modal-body" data-lenis-prevent data-scrollable="true">
                                {regError && (
                                    <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                                        ⚠ {regError}
                                    </div>
                                )}

                                <div className="pm-form-grid">
                                    <div className="pm-form-group full-width">
                                        <label className="pm-label">Patient Full Name *</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. Ramesh Kumar"
                                            value={regForm.name}
                                            onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Mobile Number (10 digits) *</label>
                                        <input
                                            type="tel"
                                            className="pm-input"
                                            placeholder="9876543210"
                                            maxLength="10"
                                            value={regForm.phone}
                                            onChange={(e) => {
                                                setRegError('');
                                                setRegForm({ ...regForm, phone: e.target.value });
                                            }}
                                            required
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Email Address (Optional)</label>
                                        <input
                                            type="email"
                                            className="pm-input"
                                            placeholder="patient@example.com"
                                            value={regForm.email}
                                            onChange={(e) => {
                                                setRegError('');
                                                setRegForm({ ...regForm, email: e.target.value });
                                            }}
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Gender</label>
                                        <select
                                            className="pm-select"
                                            value={regForm.gender}
                                            onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Age (Years)</label>
                                        <input
                                            type="number"
                                            className="pm-input"
                                            placeholder="e.g. 35"
                                            min="0"
                                            max="125"
                                            value={regForm.age}
                                            onChange={(e) => setRegForm({ ...regForm, age: e.target.value })}
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Blood Group</label>
                                        <select
                                            className="pm-select"
                                            value={regForm.bloodGroup}
                                            onChange={(e) => setRegForm({ ...regForm, bloodGroup: e.target.value })}
                                        >
                                            <option value="">Unknown / Select</option>
                                            <option value="A+">A+</option>
                                            <option value="A-">A-</option>
                                            <option value="B+">B+</option>
                                            <option value="B-">B-</option>
                                            <option value="O+">O+</option>
                                            <option value="O-">O-</option>
                                            <option value="AB+">AB+</option>
                                            <option value="AB-">AB-</option>
                                        </select>
                                    </div>

                                    <div className="pm-form-group full-width">
                                        <label className="pm-label">Residential Address / City</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. Sector 12, Rohini, Delhi"
                                            value={regForm.address}
                                            onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Known Allergies</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. Penicillin, Dust, Sulfa"
                                            value={regForm.allergies}
                                            onChange={(e) => setRegForm({ ...regForm, allergies: e.target.value })}
                                        />
                                    </div>

                                    <div className="pm-form-group">
                                        <label className="pm-label">Chronic Conditions</label>
                                        <input
                                            type="text"
                                            className="pm-input"
                                            placeholder="e.g. Hypertension, Diabetes Type 2"
                                            value={regForm.chronicConditions}
                                            onChange={(e) => setRegForm({ ...regForm, chronicConditions: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pm-modal-footer">
                                <button
                                    type="button"
                                    className="pm-btn-secondary"
                                    onClick={() => setShowRegisterModal(false)}
                                    disabled={registering}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="pm-btn-primary"
                                    disabled={registering}
                                >
                                    {registering ? 'Registering...' : 'Register Patient'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
               INDIVIDUAL PATIENT PROFILE & DIRECT PRESCRIBE (Modal)
               ───────────────────────────────────────────────────────────── */}
            {selectedPatientId && (
                <div className="pm-modal-overlay">
                    <div className="pm-modal-card pm-modal-large" role="dialog" aria-modal="true" data-scrollable="true">
                        <div className="pm-modal-header">
                            <h3 className="pm-modal-title">Patient Profile & Clinical Record</h3>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={closeProfileModal}
                            >
                                <FiX />
                            </button>
                        </div>

                        <div className="pm-modal-body" data-lenis-prevent data-scrollable="true">
                            {loadingDetails || !patientDetails ? (
                                <div className="pm-empty-state">Loading patient records...</div>
                            ) : (
                                <>
                                    {/* Patient Demographics Strip */}
                                    <div className="pm-profile-header-strip">
                                        <div>
                                            <div className="pm-profile-patient-name">
                                                {patientDetails.patient.name}
                                            </div>
                                            <div className="pm-profile-meta">
                                                <span>UID: <strong>{patientDetails.patient.patientId || patientDetails.patient.patientUid}</strong></span>
                                                <span> • Phone: {patientDetails.patient.phone || 'N/A'}</span>
                                                {patientDetails.patient.age && <span> • Age: {patientDetails.patient.age} Yrs</span>}
                                                {patientDetails.patient.gender && <span> ({patientDetails.patient.gender})</span>}
                                                {patientDetails.patient.bloodGroup && <span> • Blood: {patientDetails.patient.bloodGroup}</span>}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className="pm-action-btn-primary"
                                            style={{ padding: '8px 14px', fontSize: '12.5px' }}
                                            onClick={() => setProfileTab('prescribe')}
                                        >
                                            <FiPlus />
                                            <span>Write Prescription</span>
                                        </button>
                                    </div>

                                    {/* Tabs */}
                                    <div className="pm-tabs-bar">
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'overview' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('overview')}
                                        >
                                            Overview & History
                                        </button>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'prescriptions' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('prescriptions')}
                                        >
                                            Prescriptions ({patientDetails.prescriptions?.length || 0})
                                        </button>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'prescribe' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('prescribe')}
                                        >
                                            ✍️ Prescribe Now
                                        </button>
                                    </div>

                                    {/* TAB 1: OVERVIEW & HISTORY */}
                                    {profileTab === 'overview' && (
                                        <div>
                                            <div className="pm-form-grid" style={{ marginBottom: '20px' }}>
                                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>KNOWN ALLERGIES</span>
                                                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: patientDetails.patient.allergies ? '#dc2626' : '#1e293b' }}>
                                                        {patientDetails.patient.allergies || 'None reported'}
                                                    </p>
                                                </div>

                                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>CHRONIC CONDITIONS</span>
                                                    <p style={{ margin: '4px 0 0', fontWeight: 600, color: '#1e293b' }}>
                                                        {patientDetails.patient.chronicConditions || 'None reported'}
                                                    </p>
                                                </div>
                                            </div>

                                            <h4 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 12px', color: '#0f172a' }}>
                                                Consultation History ({patientDetails.appointments?.length || 0} Visits)
                                            </h4>

                                            {patientDetails.appointments?.length === 0 ? (
                                                <p style={{ color: '#64748b', fontSize: '13px' }}>No previous consultations on record.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                    {patientDetails.appointments.map((appt) => (
                                                        <div key={appt._id} style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '10px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                                                    {new Date(appt.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                </span>
                                                                <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                                    {appt.status?.toUpperCase() || 'COMPLETED'}
                                                                </span>
                                                            </div>
                                                            {appt.diagnosis && (
                                                                <p style={{ margin: '6px 0 2px', fontSize: '12.5px', color: '#334155' }}>
                                                                    <strong>Diagnosis:</strong> {appt.diagnosis}
                                                                </p>
                                                            )}
                                                            {appt.doctorNotes && (
                                                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                                                                    <strong>Notes:</strong> {appt.doctorNotes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB 2: PRESCRIPTIONS LIST & DOWNLOAD */}
                                    {profileTab === 'prescriptions' && (
                                        <div>
                                            {patientDetails.prescriptions?.length === 0 ? (
                                                <p style={{ color: '#64748b', fontSize: '13px' }}>No prescriptions issued yet.</p>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {patientDetails.prescriptions.map((rx, idx) => (
                                                        <div key={idx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '16px', borderRadius: '12px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                <div>
                                                                    <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                                                                        Prescription Date: {new Date(rx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </strong>
                                                                    {rx.diagnosis && <span style={{ marginLeft: '12px', color: '#0d9488', fontWeight: 600 }}>• {rx.diagnosis}</span>}
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    className="pm-view-btn"
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
                                                                            patient: patientDetails.patient,
                                                                            prescription: rx,
                                                                            diagnosis: rx.diagnosis,
                                                                            date: rx.date
                                                                        });
                                                                    }}
                                                                >
                                                                    <FiDownload />
                                                                    <span>Download PDF</span>
                                                                </button>
                                                            </div>

                                                            {rx.medicines?.length > 0 && (
                                                                <table className="pm-meds-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Medicine Name</th>
                                                                            <th>Dosage</th>
                                                                            <th>Frequency</th>
                                                                            <th>Duration</th>
                                                                            <th>Instructions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {rx.medicines.map((m, mIdx) => (
                                                                            <tr key={mIdx}>
                                                                                <td><strong>{m.medicineName || m.name}</strong></td>
                                                                                <td>{m.dosage}</td>
                                                                                <td>{m.frequency}</td>
                                                                                <td>{m.duration}</td>
                                                                                <td>{m.instructions}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB 3: WRITE PRESCRIPTION */}
                                    {profileTab === 'prescribe' && (
                                        <div>
                                            {rxNotice && (
                                                <div style={{ background: rxNotice.includes('✓') ? '#ecfdf5' : '#fef2f2', color: rxNotice.includes('✓') ? '#047857' : '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
                                                    {rxNotice}
                                                </div>
                                            )}

                                            <div className="pm-form-grid" style={{ marginBottom: '16px' }}>
                                                <div className="pm-form-group full-width">
                                                    <label className="pm-label">Clinical Diagnosis *</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. Acute Bronchitis / Viral Pharyngitis"
                                                        value={rxForm.diagnosis}
                                                        onChange={(e) => setRxForm({ ...rxForm, diagnosis: e.target.value })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Blood Pressure (BP)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 120/80"
                                                        value={rxForm.vitals.bp}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, bp: e.target.value } })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Pulse (bpm)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 74"
                                                        value={rxForm.vitals.pulse}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, pulse: e.target.value } })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Temperature (°F)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 98.6"
                                                        value={rxForm.vitals.temp}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, temp: e.target.value } })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Weight (kg)</label>
                                                    <input
                                                        type="text"
                                                        className="pm-input"
                                                        placeholder="e.g. 68"
                                                        value={rxForm.vitals.weight}
                                                        onChange={(e) => setRxForm({ ...rxForm, vitals: { ...rxForm.vitals, weight: e.target.value } })}
                                                    />
                                                </div>
                                            </div>

                                            <label className="pm-label">Prescribed Medicines</label>
                                            <table className="pm-meds-table">
                                                <thead>
                                                    <tr>
                                                        <th>Medicine Name</th>
                                                        <th>Dosage</th>
                                                        <th>Frequency</th>
                                                        <th>Duration</th>
                                                        <th>Instructions</th>
                                                        <th style={{ width: '40px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {rxForm.medicines.map((m, idx) => (
                                                        <tr key={idx}>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="e.g. Tab Paracetamol 650mg"
                                                                    value={m.medicineName}
                                                                    onChange={(e) => handleMedChange(idx, 'medicineName', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="1 tab"
                                                                    value={m.dosage}
                                                                    onChange={(e) => handleMedChange(idx, 'dosage', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="1-0-1"
                                                                    value={m.frequency}
                                                                    onChange={(e) => handleMedChange(idx, 'frequency', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="5 days"
                                                                    value={m.duration}
                                                                    onChange={(e) => handleMedChange(idx, 'duration', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    className="pm-input"
                                                                    placeholder="After food"
                                                                    value={m.instructions}
                                                                    onChange={(e) => handleMedChange(idx, 'instructions', e.target.value)}
                                                                />
                                                            </td>
                                                            <td>
                                                                {rxForm.medicines.length > 1 && (
                                                                    <button
                                                                        type="button"
                                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '15px' }}
                                                                        onClick={() => handleRemoveMedicine(idx)}
                                                                    >
                                                                        <FiTrash2 />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>

                                            <button
                                                type="button"
                                                className="pm-add-med-btn"
                                                onClick={handleAddMedicine}
                                            >
                                                + Add Another Medicine
                                            </button>

                                            <div className="pm-form-grid">
                                                <div className="pm-form-group full-width">
                                                    <label className="pm-label">Doctor Advice / Diet Instructions</label>
                                                    <textarea
                                                        className="pm-textarea"
                                                        rows="2"
                                                        placeholder="e.g. Drink plenty of warm fluids, rest for 3 days."
                                                        value={rxForm.doctorNotes}
                                                        onChange={(e) => setRxForm({ ...rxForm, doctorNotes: e.target.value })}
                                                    />
                                                </div>

                                                <div className="pm-form-group">
                                                    <label className="pm-label">Follow-Up Revisit Date (Optional)</label>
                                                    <input
                                                        type="date"
                                                        className="pm-input"
                                                        value={rxForm.followUpDate}
                                                        onChange={(e) => setRxForm({ ...rxForm, followUpDate: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                                                <button
                                                    type="button"
                                                    className="pm-btn-primary"
                                                    disabled={savingRx}
                                                    onClick={() => handleSavePrescription(false)}
                                                >
                                                    {savingRx ? 'Saving...' : 'Save Prescription'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="pm-btn-primary"
                                                    style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                                                    disabled={savingRx}
                                                    onClick={() => handleSavePrescription(true)}
                                                >
                                                    <FiDownload style={{ marginRight: '6px' }} />
                                                    {savingRx ? 'Saving...' : 'Save & Download PDF 📄'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientMonitoring;

