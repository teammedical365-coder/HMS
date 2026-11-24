import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LabLayout from '../../components/lab/LabLayout';
import { labAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
    FiUsers, FiUserPlus, FiSearch, FiEdit2, FiTrash2,
    FiPlusCircle, FiFileText, FiAlertTriangle, FiCheckCircle,
    FiRefreshCw, FiPhone, FiMapPin, FiCalendar, FiUpload, FiX
} from 'react-icons/fi';
import './LabPatientsPage.css';

const GENDERS = ['Male', 'Female', 'Other'];

const defaultPatientForm = () => ({
    name: '',
    gender: 'Male',
    dob: '',
    age: '',
    phone: '',
    alternatePhone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    referringDoctor: '',
    referringDoctorName: '',
    emergencyContactName: '',
    emergencyContactMobile: '',
    emergencyContactRelation: ''
});

const LabPatientsPage = () => {
    const navigate = useNavigate();

    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalPatients, setTotalPatients] = useState(0);

    // Modal state
    const [registerModalOpen, setRegisterModalOpen] = useState(false);
    const [editPatient, setEditingPatient] = useState(null);
    const [patientForm, setPatientForm] = useState(defaultPatientForm());
    const [saving, setSaving] = useState(false);

    // Doctors Master for Referring Doctor dropdown
    const [doctors, setDoctors] = useState([]);

    // Duplicate Detection state
    const [duplicateWarning, setDuplicateWarning] = useState(null);
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);

    // Prescription Upload Modal
    const [uploadModalPatient, setUploadModalPatient] = useState(null);
    const [uploadFiles, setUploadFiles] = useState([]);
    const [uploading, setUploading] = useState(false);

    // View Patient Details Modal
    const [viewPatientModal, setViewPatientModal] = useState(null);

    // Load Doctors
    const loadDoctors = async () => {
        try {
            const res = await labAPI.master.getDoctors({ isActive: 'true' });
            if (res.success) setDoctors(res.data || []);
        } catch (err) {
            console.error('Failed to load doctors:', err);
        }
    };

    // Load Patients
    const loadPatients = async (pageNum = 1, searchTerm = search) => {
        setLoading(true);
        try {
            const res = await labAPI.reception.getPatients({
                search: searchTerm,
                page: pageNum,
                limit: 15
            });
            if (res.success) {
                setPatients(res.data || []);
                setPage(res.pagination?.page || 1);
                setTotalPages(res.pagination?.totalPages || 1);
                setTotalPatients(res.pagination?.total || 0);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load patients');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPatients(1, '');
        loadDoctors();
    }, []);

    // Duplicate Check Handler
    const handleCheckDuplicate = async (phoneVal, nameVal) => {
        if (!phoneVal || phoneVal.length < 10) {
            setDuplicateWarning(null);
            return;
        }
        setCheckingDuplicates(true);
        try {
            const res = await labAPI.reception.checkDuplicatePatient({
                phone: phoneVal,
                name: nameVal
            });
            if (res.success && res.isDuplicate && res.duplicates?.length > 0) {
                setDuplicateWarning(res.duplicates);
            } else {
                setDuplicateWarning(null);
            }
        } catch (err) {
            console.warn('Duplicate check warning:', err.message);
        } finally {
            setCheckingDuplicates(false);
        }
    };

    // Open Register Modal
    const handleOpenRegister = () => {
        setEditingPatient(null);
        setPatientForm(defaultPatientForm());
        setDuplicateWarning(null);
        setRegisterModalOpen(true);
    };

    // Open Edit Modal
    const handleOpenEdit = (p) => {
        setEditingPatient(p);
        setPatientForm({
            name: p.name || '',
            gender: p.gender || 'Male',
            dob: p.dob ? new Date(p.dob).toISOString().slice(0, 10) : '',
            age: p.age || '',
            phone: p.phone || '',
            alternatePhone: p.alternatePhone || p.alternateMobile || '',
            email: p.email || '',
            address: p.address || '',
            city: p.city || '',
            state: p.state || '',
            pinCode: p.pinCode || p.zipCode || '',
            referringDoctor: p.referringDoctor?._id || p.referringDoctor || '',
            referringDoctorName: p.referringDoctorName || '',
            emergencyContactName: p.emergencyContact?.name || '',
            emergencyContactMobile: p.emergencyContact?.mobile || '',
            emergencyContactRelation: p.emergencyContact?.relation || ''
        });
        setDuplicateWarning(null);
        setRegisterModalOpen(true);
    };

    // Save Patient (Create / Update)
    const handleSavePatient = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...patientForm,
                emergencyContact: patientForm.emergencyContactName ? {
                    name: patientForm.emergencyContactName,
                    mobile: patientForm.emergencyContactMobile,
                    relation: patientForm.emergencyContactRelation
                } : undefined
            };

            if (editPatient) {
                const res = await labAPI.reception.updatePatient(editPatient._id, payload);
                if (res.success) {
                    toast.success('Patient information updated successfully!');
                    setRegisterModalOpen(false);
                    loadPatients(page);
                }
            } else {
                const res = await labAPI.reception.registerPatient(payload);
                if (res.success) {
                    toast.success(`Patient registered with UHID: ${res.patient?.uhid || res.patient?.mrn}`);
                    setRegisterModalOpen(false);
                    loadPatients(1, '');
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving patient record');
        } finally {
            setSaving(false);
        }
    };

    // Deactivate Patient
    const handleDeactivate = async (patient) => {
        const reason = window.prompt(`Are you sure you want to deactivate patient "${patient.name}"? Please provide a reason:`);
        if (!reason) return;

        try {
            const res = await labAPI.reception.deactivatePatient(patient._id, reason);
            if (res.success) {
                toast.success('Patient record deactivated successfully');
                loadPatients(page);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to deactivate patient');
        }
    };

    // Upload Prescriptions
    const handleUploadPrescriptions = async (e) => {
        e.preventDefault();
        if (!uploadFiles || uploadFiles.length === 0) return toast.error('Please select at least one prescription file');

        setUploading(true);
        try {
            const formData = new FormData();
            for (let i = 0; i < uploadFiles.length; i++) {
                formData.append('prescriptions', uploadFiles[i]);
            }
            const res = await labAPI.reception.uploadPrescriptions(uploadModalPatient._id, formData);
            if (res.success) {
                toast.success(res.message);
                setUploadModalPatient(null);
                setUploadFiles([]);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to upload prescriptions');
        } finally {
            setUploading(false);
        }
    };

    return (
        <LabLayout
            title="Laboratory Patient Directory &amp; Registration"
            subtitle="Search, register, verify UHID, and manage patient clinical profiles"
        >
            {/* Top Action Bar */}
            <div className="lmd-patient-action-bar">
                <div className="lmd-patient-search-group">
                    <FiSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search by UHID, MRN, Name, or Mobile Number..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadPatients(1, search)}
                    />
                    <button className="btn-search" onClick={() => loadPatients(1, search)}>Search</button>
                </div>

                <div className="lmd-patient-top-btns">
                    <button className="btn-refresh" onClick={() => loadPatients(page, search)} title="Refresh">
                        <FiRefreshCw className={loading ? 'spin' : ''} />
                    </button>
                    <button className="btn-register" onClick={handleOpenRegister}>
                        <FiUserPlus /> Register New Patient
                    </button>
                </div>
            </div>

            {/* Patients Table Card */}
            <div className="lmd-patient-card">
                <div className="lmd-patient-table-hdr">
                    <div>
                        <h3>Registered Patients Directory</h3>
                        <p className="sub">Total: {totalPatients} patient profile(s)</p>
                    </div>
                </div>

                {loading ? (
                    <div className="lmd-loading-box">
                        <FiRefreshCw className="spin" /> Loading patient records...
                    </div>
                ) : patients.length === 0 ? (
                    <div className="lmd-empty-box">
                        <FiUsers style={{ fontSize: '36px', color: '#94a3b8' }} />
                        <p>No matching patient records found.</p>
                        <button className="btn-register" onClick={handleOpenRegister}>Register First Patient</button>
                    </div>
                ) : (
                    <div className="lmd-table-wrapper">
                        <table className="lmd-table">
                            <thead>
                                <tr>
                                    <th>UHID / MRN</th>
                                    <th>Patient Name</th>
                                    <th>Contact</th>
                                    <th>Age / Gender</th>
                                    <th>City &amp; Address</th>
                                    <th>Referring Doctor</th>
                                    <th>Registered Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map(p => (
                                    <tr key={p._id}>
                                        <td className="bold text-blue">{p.uhid || p.mrn || '—'}</td>
                                        <td>
                                            <div className="bold">{p.name}</div>
                                            {p.email && <div className="subtext">{p.email}</div>}
                                        </td>
                                        <td>
                                            <div className="bold">{p.phone}</div>
                                            {p.alternatePhone && <div className="subtext">Alt: {p.alternatePhone}</div>}
                                        </td>
                                        <td>
                                            {p.age ? `${p.age} Yrs` : '—'} / {p.gender || '—'}
                                        </td>
                                        <td>
                                            <div>{p.city || '—'}</div>
                                            <div className="subtext">{p.address}</div>
                                        </td>
                                        <td>
                                            {p.referringDoctor?.doctorName ? `Dr. ${p.referringDoctor.doctorName}` : p.referringDoctorName || <span className="subtext">Direct Walk-in</span>}
                                        </td>
                                        <td>
                                            {new Date(p.createdAt).toLocaleDateString('en-IN')}
                                        </td>
                                        <td>
                                            <div className="lmd-table-actions">
                                                <button
                                                    className="lmd-action-btn primary"
                                                    title="Book Lab Order"
                                                    onClick={() => navigate(`/lab/orders/create?patientId=${p._id}`)}
                                                >
                                                    <FiPlusCircle /> Book Order
                                                </button>
                                                <button
                                                    className="lmd-icon-btn"
                                                    title="Upload Prescription"
                                                    onClick={() => { setUploadModalPatient(p); setUploadFiles([]); }}
                                                >
                                                    <FiUpload />
                                                </button>
                                                <button
                                                    className="lmd-icon-btn"
                                                    title="Edit Demographics"
                                                    onClick={() => handleOpenEdit(p)}
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className="lmd-icon-btn danger"
                                                    title="Deactivate Patient"
                                                    onClick={() => handleDeactivate(p)}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="lmd-pagination-bar">
                        <button
                            disabled={page <= 1}
                            onClick={() => loadPatients(page - 1)}
                            className="btn-page"
                        >
                            Previous
                        </button>
                        <span>Page {page} of {totalPages}</span>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => loadPatients(page + 1)}
                            className="btn-page"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* =========================================================
                MODAL 1: REGISTER / EDIT PATIENT
               ========================================================= */}
            {registerModalOpen && (
                <div className="lmd-modal-overlay" onClick={() => setRegisterModalOpen(false)}>
                    <div className="lmd-modal-card wide" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>{editPatient ? 'Edit Patient Information' : 'Register New Laboratory Patient'}</h3>
                            <button className="lmd-close-btn" onClick={() => setRegisterModalOpen(false)}>✕</button>
                        </div>

                        {/* Duplicate Warning Alert */}
                        {duplicateWarning && duplicateWarning.length > 0 && !editPatient && (
                            <div className="lmd-duplicate-alert">
                                <div className="alert-hdr">
                                    <FiAlertTriangle />
                                    <strong>Possible Duplicate Patient(s) Detected!</strong>
                                </div>
                                <p className="subtext">A patient with matching mobile number or name already exists in this hospital:</p>
                                <div className="duplicate-list">
                                    {duplicateWarning.map(dup => (
                                        <div key={dup._id} className="duplicate-item">
                                            <div>
                                                <strong>{dup.name}</strong> • UHID: <span className="text-blue">{dup.uhid || dup.mrn}</span> • Phone: {dup.phone} ({dup.age} Yrs, {dup.gender})
                                            </div>
                                            <button
                                                type="button"
                                                className="btn-use-existing"
                                                onClick={() => {
                                                    setRegisterModalOpen(false);
                                                    navigate(`/lab/orders/create?patientId=${dup._id}`);
                                                }}
                                            >
                                                Select This Patient &amp; Book Order
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleSavePatient} className="lmd-modal-form">
                            <div className="lmd-form-grid-3">
                                <div className="lmd-form-group">
                                    <label>Patient Full Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Ramesh Kumar"
                                        value={patientForm.name}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setPatientForm({ ...patientForm, name: val });
                                            handleCheckDuplicate(patientForm.phone, val);
                                        }}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>Mobile Phone Number (10 Digits) *</label>
                                    <input
                                        type="tel"
                                        required
                                        maxLength="10"
                                        placeholder="e.g. 9876543210"
                                        value={patientForm.phone}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                                            setPatientForm({ ...patientForm, phone: val });
                                            handleCheckDuplicate(val, patientForm.name);
                                        }}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>Gender *</label>
                                    <select
                                        value={patientForm.gender}
                                        onChange={(e) => setPatientForm({ ...patientForm, gender: e.target.value })}
                                    >
                                        {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>

                                <div className="lmd-form-group">
                                    <label>Date of Birth</label>
                                    <input
                                        type="date"
                                        value={patientForm.dob}
                                        onChange={(e) => {
                                            const dobVal = e.target.value;
                                            let derivedAge = patientForm.age;
                                            if (dobVal) {
                                                const diff = Date.now() - new Date(dobVal).getTime();
                                                derivedAge = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
                                            }
                                            setPatientForm({ ...patientForm, dob: dobVal, age: derivedAge });
                                        }}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>Age (Years) *</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="125"
                                        required
                                        placeholder="e.g. 42"
                                        value={patientForm.age}
                                        onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>Alternate Phone</label>
                                    <input
                                        type="tel"
                                        placeholder="e.g. 9811223344"
                                        value={patientForm.alternatePhone}
                                        onChange={(e) => setPatientForm({ ...patientForm, alternatePhone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="lmd-form-grid-3">
                                <div className="lmd-form-group">
                                    <label>Email Address</label>
                                    <input
                                        type="email"
                                        placeholder="patient@example.com"
                                        value={patientForm.email}
                                        onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>City</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. New Delhi"
                                        value={patientForm.city}
                                        onChange={(e) => setPatientForm({ ...patientForm, city: e.target.value })}
                                    />
                                </div>

                                <div className="lmd-form-group">
                                    <label>PIN Code</label>
                                    <input
                                        type="text"
                                        maxLength="6"
                                        placeholder="e.g. 110001"
                                        value={patientForm.pinCode}
                                        onChange={(e) => setPatientForm({ ...patientForm, pinCode: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="lmd-form-group">
                                <label>Residential Address</label>
                                <textarea
                                    rows="2"
                                    placeholder="Street, locality, landmarks..."
                                    value={patientForm.address}
                                    onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
                                />
                            </div>

                            <div className="lmd-form-grid-2">
                                <div className="lmd-form-group">
                                    <label>Referring Doctor (Phase 3 Master)</label>
                                    <select
                                        value={patientForm.referringDoctor}
                                        onChange={(e) => setPatientForm({ ...patientForm, referringDoctor: e.target.value })}
                                    >
                                        <option value="">-- Direct Walk-in / Self --</option>
                                        {doctors.map(d => (
                                            <option key={d._id} value={d._id}>
                                                Dr. {d.doctorName} ({d.specialization})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="lmd-form-group">
                                    <label>Or Free-text Referring Doctor</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Dr. A. K. Sharma (Outside Clinic)"
                                        value={patientForm.referringDoctorName}
                                        onChange={(e) => setPatientForm({ ...patientForm, referringDoctorName: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="lmd-modal-actions">
                                <button type="button" className="lmd-btn-outline" onClick={() => setRegisterModalOpen(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="lmd-btn-primary" disabled={saving}>
                                    <FiCheckCircle /> {saving ? 'Saving…' : editPatient ? 'Update Patient' : 'Register Patient & Generate UHID'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL 2: UPLOAD PRESCRIPTIONS
               ========================================================= */}
            {uploadModalPatient && (
                <div className="lmd-modal-overlay" onClick={() => setUploadModalPatient(null)}>
                    <div className="lmd-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="lmd-modal-hdr">
                            <h3>Upload Doctor Prescriptions</h3>
                            <button className="lmd-close-btn" onClick={() => setUploadModalPatient(null)}>✕</button>
                        </div>
                        <form onSubmit={handleUploadPrescriptions} className="lmd-modal-form">
                            <div>
                                <p><strong>Patient:</strong> {uploadModalPatient.name} ({uploadModalPatient.uhid || uploadModalPatient.mrn})</p>
                                <p className="subtext">Supported formats: PDF, JPG, JPEG, PNG (Max 10MB per file)</p>
                            </div>

                            <div className="lmd-file-dropzone">
                                <input
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                                    capture="environment"
                                    onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                                />
                                <div className="dropzone-text">
                                    <FiUpload style={{ fontSize: '28px', color: '#2563eb' }} />
                                    <p>Click or drag files here, or capture with camera</p>
                                    {uploadFiles.length > 0 && (
                                        <div className="selected-files">
                                            {uploadFiles.map((f, i) => <div key={i}>📄 {f.name} ({(f.size / 1024).toFixed(1)} KB)</div>)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="lmd-modal-actions">
                                <button type="button" className="lmd-btn-outline" onClick={() => setUploadModalPatient(null)}>Cancel</button>
                                <button type="submit" className="lmd-btn-primary" disabled={uploading || uploadFiles.length === 0}>
                                    {uploading ? 'Uploading…' : `Upload ${uploadFiles.length} File(s)`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </LabLayout>
    );
};

export default LabPatientsPage;
