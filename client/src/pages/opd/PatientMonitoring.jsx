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
                <div className="pm-fullscreen-page" role="dialog" aria-modal="true">
                    <div className="pm-fullscreen-page-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#e6fffa', color: '#0d9488', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                    <FiUser />
                                </div>
                                <div>
                                    <h3 className="pm-modal-title" style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                        Patient Profile & Comprehensive Clinical Record
                                    </h3>
                                    <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                                        Complete demographics, contact info, clinical alerts, and historical visits
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="pm-modal-close-btn"
                                onClick={closeProfileModal}
                                title="Close Profile (Esc)"
                                style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', cursor: 'pointer' }}
                            >
                                <FiX style={{ fontSize: '22px' }} />
                            </button>
                        </div>

                        <div className="pm-fullscreen-page-body" data-lenis-prevent data-scrollable="true">
                            {loadingDetails || !patientDetails ? (
                                <div className="pm-empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Loading patient profile...</div>
                                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Fetching demographics, contact info, and medical history</div>
                                </div>
                            ) : (
                                <>
                                    {/* Patient Hero Banner */}
                                    <div className="pm-profile-hero">
                                        <div className="pm-profile-avatar-row">
                                            <div className="pm-profile-avatar">
                                                {(patientDetails.patient?.name || 'P').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="pm-profile-name">
                                                    {patientDetails.patient?.name || 'Patient'}
                                                </div>
                                                <div className="pm-profile-chips">
                                                    <span className="pm-chip uid-chip">
                                                        🆔 UID: {patientDetails.patient?.patientId || patientDetails.patient?.patientUid || 'N/A'}
                                                    </span>
                                                    <span className="pm-chip">
                                                        📞 {patientDetails.patient?.phone || 'No phone'}
                                                    </span>
                                                    <span className="pm-chip email-chip" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534', fontWeight: 600 }}>
                                                        <FiMail style={{ marginRight: '4px' }} />
                                                        {patientDetails.patient?.email || 'No email provided'}
                                                    </span>
                                                    {patientDetails.patient?.age && (
                                                        <span className="pm-chip">
                                                            🎂 {patientDetails.patient.age} Yrs {patientDetails.patient?.gender ? `(${patientDetails.patient.gender})` : ''}
                                                        </span>
                                                    )}
                                                    {patientDetails.patient?.bloodGroup && (
                                                        <span className="pm-chip" style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>
                                                            🩸 {patientDetails.patient.bloodGroup}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tabs Bar: Overview vs Prescriptions (Removed Prescribe Now) */}
                                    <div className="pm-tabs-bar" style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'overview' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('overview')}
                                            style={{ padding: '10px 18px', fontWeight: 700, fontSize: '13.5px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: profileTab === 'overview' ? '3px solid #0d9488' : '3px solid transparent', color: profileTab === 'overview' ? '#0d9488' : '#64748b' }}
                                        >
                                            Overview & Clinical Information
                                        </button>
                                        <button
                                            type="button"
                                            className={`pm-tab-btn ${profileTab === 'prescriptions' ? 'active' : ''}`}
                                            onClick={() => setProfileTab('prescriptions')}
                                            style={{ padding: '10px 18px', fontWeight: 700, fontSize: '13.5px', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: profileTab === 'prescriptions' ? '3px solid #0d9488' : '3px solid transparent', color: profileTab === 'prescriptions' ? '#0d9488' : '#64748b' }}
                                        >
                                            Prescriptions History ({patientDetails.prescriptions?.length || 0})
                                        </button>
                                    </div>

                                    {/* TAB 1: OVERVIEW & CLINICAL DETAILS */}
                                    {profileTab === 'overview' && (
                                        <div>
                                            {/* 3-Card Detailed Information Grid */}
                                            <div className="pm-profile-grid">
                                                {/* Card 1: Personal & Contact Information */}
                                                <div className="pm-info-card">
                                                    <div className="pm-info-card-header">
                                                        <span>👤 Personal & Contact Info</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Full Name</span>
                                                        <span className="pm-info-value">{patientDetails.patient?.name || 'N/A'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Patient UID</span>
                                                        <span className="pm-info-value" style={{ color: '#0d9488' }}>
                                                            {patientDetails.patient?.patientId || patientDetails.patient?.patientUid || 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Mobile Phone</span>
                                                        <span className="pm-info-value">{patientDetails.patient?.phone || 'N/A'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Email Address</span>
                                                        <span className="pm-info-value" style={{ color: patientDetails.patient?.email ? '#0284c7' : '#94a3b8', wordBreak: 'break-all', fontWeight: 700 }}>
                                                            {patientDetails.patient?.email || 'Not provided'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Age & Gender</span>
                                                        <span className="pm-info-value">
                                                            {patientDetails.patient?.age ? `${patientDetails.patient.age} Yrs` : 'N/A'} {patientDetails.patient?.gender ? `(${patientDetails.patient.gender})` : ''}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Blood Group</span>
                                                        <span className="pm-info-value" style={{ color: '#dc2626' }}>
                                                            {patientDetails.patient?.bloodGroup || 'Not specified'}
                                                        </span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Address</span>
                                                        <span className="pm-info-value" style={{ fontSize: '12px' }}>
                                                            {[patientDetails.patient?.address, patientDetails.patient?.city, patientDetails.patient?.state, patientDetails.patient?.pincode].filter(Boolean).join(', ') || 'Not provided'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Card 2: Medical & Clinical Alerts */}
                                                <div className="pm-info-card">
                                                    <div className="pm-info-card-header">
                                                        <span>⚠️ Medical Alerts & Conditions</span>
                                                    </div>
                                                    <div style={{ marginBottom: '14px' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Known Allergies</span>
                                                        <div style={{ marginTop: '4px', padding: '8px 12px', background: patientDetails.patient?.allergies ? '#fef2f2' : '#f8fafc', border: `1px solid ${patientDetails.patient?.allergies ? '#fecaca' : '#e2e8f0'}`, borderRadius: '8px', fontWeight: 600, color: patientDetails.patient?.allergies ? '#dc2626' : '#475569', fontSize: '13px' }}>
                                                            {patientDetails.patient?.allergies || 'None reported'}
                                                        </div>
                                                    </div>
                                                    <div style={{ marginBottom: '14px' }}>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Chronic Conditions</span>
                                                        <div style={{ marginTop: '4px', padding: '8px 12px', background: patientDetails.patient?.chronicConditions ? '#fffbeb' : '#f8fafc', border: `1px solid ${patientDetails.patient?.chronicConditions ? '#fde68a' : '#e2e8f0'}`, borderRadius: '8px', fontWeight: 600, color: patientDetails.patient?.chronicConditions ? '#b45309' : '#475569', fontSize: '13px' }}>
                                                            {patientDetails.patient?.chronicConditions || 'None reported'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Medical Notes</span>
                                                        <div style={{ marginTop: '4px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#475569', fontSize: '12.5px', lineHeight: 1.4 }}>
                                                            {patientDetails.patient?.medicalNotes || 'No specific clinical notes on record.'}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Card 3: Latest Recorded Vitals */}
                                                <div className="pm-info-card">
                                                    <div className="pm-info-card-header">
                                                        <span>💓 Latest Vitals & Stats</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Blood Pressure (BP)</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.bp || 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Pulse Rate</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.pulse ? `${patientDetails.vitals.pulse} bpm` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Body Temperature</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.temp ? `${patientDetails.vitals.temp} °F` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Oxygen SpO2</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.spo2 ? `${patientDetails.vitals.spo2} %` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Weight</span>
                                                        <span className="pm-info-value">{patientDetails.vitals?.weight ? `${patientDetails.vitals.weight} kg` : 'Not recorded'}</span>
                                                    </div>
                                                    <div className="pm-info-row">
                                                        <span className="pm-info-label">Total Recorded Visits</span>
                                                        <span className="pm-info-value" style={{ color: '#0d9488' }}>
                                                            {patientDetails.appointments?.length || 0} Consultations
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Consultation Visits History */}
                                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                                <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>
                                                    Consultation History ({patientDetails.appointments?.length || 0} Visits)
                                                </h4>

                                                {(!patientDetails.appointments || patientDetails.appointments.length === 0) ? (
                                                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                                                        No consultation visits recorded for this patient yet.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {patientDetails.appointments.map((appt) => (
                                                            <div
                                                                key={appt._id}
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    padding: '12px 16px',
                                                                    background: '#f8fafc',
                                                                    border: '1px solid #e2e8f0',
                                                                    borderRadius: '10px',
                                                                    flexWrap: 'wrap',
                                                                    gap: '8px'
                                                                }}
                                                            >
                                                                <div>
                                                                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
                                                                        📅 {new Date(appt.appointmentDate || appt.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </div>
                                                                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                                                                        {appt.doctorName || appt.doctorId?.name ? `Doctor: ${appt.doctorName || appt.doctorId?.name}` : 'General Consultation'}
                                                                        {appt.diagnosis && ` • Diagnosis: ${appt.diagnosis}`}
                                                                        {appt.chiefComplaint && ` • Complaint: ${appt.chiefComplaint}`}
                                                                    </div>
                                                                </div>
                                                                <span
                                                                    style={{
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '11.5px',
                                                                        fontWeight: 700,
                                                                        textTransform: 'uppercase',
                                                                        background: appt.status === 'completed' ? '#dcfce7' : appt.status === 'in-consultation' ? '#dbeafe' : '#f1f5f9',
                                                                        color: appt.status === 'completed' ? '#15803d' : appt.status === 'in-consultation' ? '#1d4ed8' : '#475569'
                                                                    }}
                                                                >
                                                                    {appt.status}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* TAB 2: PRESCRIPTIONS HISTORY */}
                                    {profileTab === 'prescriptions' && (
                                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px 22px' }}>
                                            <h4 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>
                                                Issued Prescriptions & Medication Logs
                                            </h4>

                                            {(!patientDetails.prescriptions || patientDetails.prescriptions.length === 0) ? (
                                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13.5px' }}>
                                                    No prescriptions have been issued to this patient yet.
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    {patientDetails.prescriptions.map((rx, idx) => (
                                                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '18px 20px', borderRadius: '14px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                                                                <div>
                                                                    <strong style={{ fontSize: '14px', color: '#0f172a' }}>
                                                                        📄 Prescription Date: {new Date(rx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                    </strong>
                                                                    {rx.diagnosis && (
                                                                        <span style={{ marginLeft: '12px', color: '#0d9488', fontWeight: 700, fontSize: '13px' }}>
                                                                            • {rx.diagnosis}
                                                                        </span>
                                                                    )}
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
                                                                <div style={{ overflowX: 'auto' }}>
                                                                    <table className="pm-meds-table" style={{ width: '100%', marginTop: '6px' }}>
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
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="pm-fullscreen-page-footer">
                            <button
                                type="button"
                                className="pm-btn-secondary"
                                onClick={closeProfileModal}
                            >
                                Close Profile
                            </button>
                        </div>
                    </div>
            )}
        </div>
    );
};

export default PatientMonitoring;

