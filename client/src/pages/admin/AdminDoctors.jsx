import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useAdminEntities } from '../../store/hooks';
import { fetchAdminDoctors, createDoctor, updateDoctor, deleteDoctor } from '../../store/slices/adminEntitiesSlice';
import { adminEntitiesAPI, hospitalAPI } from '../../utils/api';
import { getSubscriptionLimits } from '../../utils/subscriptionPlans';
import './AdminDoctors.css';

const AdminDoctors = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { user } = useAuth();
    const { doctors: doctorsState } = useAdminEntities();

    const doctors = doctorsState.data || [];
    const loadingData = doctorsState.loading;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [showForm, setShowForm] = useState(true);
    const [hospital, setHospital] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // List filtering and view mode
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

    // Viewing doctor details modal state
    const [viewingDoctor, setViewingDoctor] = useState(null);
    const [loadingDoctorDetails, setLoadingDoctorDetails] = useState(false);
    const [viewDoctorError, setViewDoctorError] = useState('');

    useEffect(() => {
        const fetchHospital = async () => {
            try {
                const res = await hospitalAPI.getMyHospital();
                if (res.success && res.hospital) {
                    setHospital(res.hospital);
                }
            } catch (err) {
                console.error('Error fetching hospital:', err);
            }
        };
        if (user?.role === 'hospitaladmin') {
            fetchHospital();
        }
    }, [user]);

    // Default Availability Structure
    const defaultAvailability = {
        monday: { available: false, startTime: '09:00', endTime: '17:00' },
        tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
        wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
        thursday: { available: false, startTime: '09:00', endTime: '17:00' },
        friday: { available: false, startTime: '09:00', endTime: '17:00' },
        saturday: { available: false, startTime: '09:00', endTime: '17:00' },
        sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    };

    const initialFormState = {
        name: '',
        email: '',
        phone: '',
        password: '',
        gender: '',
        specialty: '',
        experience: '',
        education: '',
        services: [],
        departments: [],
        availability: defaultAvailability,
        successRate: '90%',
        patientsCount: '100+',
        image: '👨‍⚕️',
        bio: '',
        consultationFee: ''
    };

    const [formData, setFormData] = useState(initialFormState);
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const isHospitalAdmin = user?.role === 'hospitaladmin';

    useEffect(() => {
        if (!user || !['admin', 'hospitaladmin'].includes(user.role)) {
            navigate('/');
            return;
        }
        dispatch(fetchAdminDoctors());
    }, [navigate, user, dispatch]);

    useEffect(() => {
        if (doctorsState.error) setError(doctorsState.error);
    }, [doctorsState.error]);

    // Auto-fetch department consultation fee when a new department is selected
    useEffect(() => {
        if (!editingDoctor && formData.departments && formData.departments.length > 0) {
            const selectedDept = formData.departments[0];
            if (hospital && hospital.departmentFees && hospital.departmentFees[selectedDept] !== undefined) {
                setFormData(prev => ({
                    ...prev,
                    consultationFee: hospital.departmentFees[selectedDept]
                }));
            }
        }
    }, [formData.departments, hospital, editingDoctor]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
        setError('');
        setSuccess('');
    };

    const handleAvailabilityChange = (day, field, value) => {
        setFormData(prev => ({
            ...prev,
            availability: {
                ...prev.availability,
                [day]: {
                    ...prev.availability[day],
                    [field]: value
                }
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            if (editingDoctor) {
                const result = await dispatch(updateDoctor({ id: editingDoctor._id, doctorData: formData }));
                if (updateDoctor.fulfilled.match(result)) {
                    setSuccess('Doctor profile updated successfully!');
                    resetForm();
                    dispatch(fetchAdminDoctors());
                } else {
                    setError(result.payload || 'Failed to update doctor profile');
                }
            } else {
                if (!formData.name || !formData.email) {
                    setError('Name and email are required');
                    setLoading(false);
                    return;
                }
                if (!formData.password || formData.password.length < 6) {
                    setError('Password is required and must be at least 6 characters');
                    setLoading(false);
                    return;
                }

                const doctorData = {
                    ...formData,
                    consultationFee: formData.consultationFee ? Number(formData.consultationFee) : 0
                };

                const result = await dispatch(createDoctor(doctorData));
                if (createDoctor.fulfilled.match(result)) {
                    setSuccess('Doctor profile created successfully!');
                    resetForm();
                    dispatch(fetchAdminDoctors());
                } else {
                    setError(result.payload || 'Failed to create doctor');
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving doctor');
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (id) => {
        setLoadingDoctorDetails(true);
        setViewDoctorError('');
        setViewingDoctor(null);
        try {
            const res = await adminEntitiesAPI.getDoctor(id);
            if (res.success && res.doctor) {
                setViewingDoctor(res.doctor);
            } else {
                setViewDoctorError(res.message || 'Failed to load doctor profile details.');
            }
        } catch (err) {
            setViewDoctorError(err.response?.data?.message || 'Error fetching doctor profile details.');
        } finally {
            setLoadingDoctorDetails(false);
        }
    };

    const handleEdit = (doctor) => {
        setEditingDoctor(doctor);

        const mergedAvailability = { ...defaultAvailability };
        if (doctor.availability) {
            Object.keys(doctor.availability).forEach(day => {
                if (mergedAvailability[day]) {
                    mergedAvailability[day] = { ...mergedAvailability[day], ...doctor.availability[day] };
                }
            });
        }

        setFormData({
            name: doctor.name || doctor.userId?.name || '',
            email: doctor.email || doctor.userId?.email || '',
            phone: doctor.phone || doctor.userId?.phone || '',
            password: '',
            gender: doctor.gender || doctor.userId?.gender || '',
            specialty: doctor.specialty || '',
            experience: doctor.experience || '',
            education: doctor.education || '',
            services: doctor.services || [],
            departments: doctor.departments || [],
            availability: mergedAvailability,
            successRate: doctor.successRate || '90%',
            patientsCount: doctor.patientsCount || '100+',
            image: doctor.image || '👨‍⚕️',
            bio: doctor.bio || '',
            consultationFee: doctor.consultationFee || ''
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this doctor?')) {
            await dispatch(deleteDoctor(id));
            setSuccess('Doctor deleted successfully');
            dispatch(fetchAdminDoctors());
        }
    };

    const resetForm = () => {
        setFormData(initialFormState);
        setEditingDoctor(null);
    };

    // Filtered Doctors List
    const filteredDoctors = useMemo(() => {
        return doctors.filter(doc => {
            const name = (doc.name || doc.userId?.name || '').toLowerCase();
            const email = (doc.email || doc.userId?.email || '').toLowerCase();
            const spec = (doc.specialty || '').toLowerCase();
            const q = searchQuery.toLowerCase();

            const matchesSearch = !q || name.includes(q) || email.includes(q) || spec.includes(q);
            const matchesDept = selectedDeptFilter === 'ALL' || (doc.departments && doc.departments.includes(selectedDeptFilter));

            return matchesSearch && matchesDept;
        });
    }, [doctors, searchQuery, selectedDeptFilter]);

    // Quota details
    const quotaLimits = hospital ? getSubscriptionLimits(hospital.subscriptionPlan) : { maxDoctors: 15 };
    const maxDocs = quotaLimits?.maxDoctors || 15;
    const docCount = doctors.length;
    const remainingDocs = Math.max(0, maxDocs - docCount);
    const isQuotaReached = hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter') && docCount >= maxDocs;

    return (
        <div className="ad-page-container">
            {/* ==================== 1. HERO BANNER (MATCHING SCREENSHOT) ==================== */}
            <div className="ad-hero-banner">
                {/* 3D Holographic AI Neural Network Watermark */}
                <div className="ad-hero-ai-watermark">
                    <svg viewBox="0 0 300 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="aiGlobeGrad" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                                <stop offset="100%" stopColor="#818cf8" stopOpacity="0.2" />
                            </linearGradient>
                        </defs>
                        {/* Orbit Rings */}
                        <ellipse cx="150" cy="80" rx="90" ry="38" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3 4" transform="rotate(-15 150 80)" opacity="0.6" />
                        <ellipse cx="150" cy="80" rx="75" ry="32" stroke="#818cf8" strokeWidth="1.2" transform="rotate(20 150 80)" opacity="0.5" />
                        <circle cx="150" cy="80" r="55" fill="none" stroke="#bae6fd" strokeWidth="1" opacity="0.4" />
                        <circle cx="150" cy="80" r="42" fill="url(#aiGlobeGrad)" stroke="#38bdf8" strokeWidth="1.5" />
                        <text x="150" y="89" textAnchor="middle" fill="#0369a1" fontSize="26" fontWeight="900" fontFamily="sans-serif">AI</text>
                    </svg>
                </div>

                <div className="ad-hero-left">
                    <h1 className="ad-hero-title">
                        Manage <span className="ad-title-highlight">Doctors</span>
                    </h1>
                    <p className="ad-hero-subtitle">
                        Add and manage doctor profiles for the user platform.
                    </p>
                </div>

                {/* Right Side Quota & Action Button */}
                <div className="ad-hero-right">
                    {/* Used Quota Card */}
                    <div className="ad-quota-card">
                        <div className="ad-quota-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <div className="ad-quota-info">
                            <span className="ad-quota-val">{docCount} / {maxDocs}</span>
                            <span className="ad-quota-lbl">Used</span>
                        </div>
                    </div>

                    {/* Remaining Quota Card */}
                    <div className={`ad-quota-card ${remainingDocs === 0 ? 'quota-full' : 'quota-remaining'}`}>
                        <div className="ad-quota-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <line x1="20" y1="8" x2="20" y2="14" />
                                <line x1="23" y1="11" x2="17" y2="11" />
                            </svg>
                        </div>
                        <div className="ad-quota-info">
                            <span className="ad-quota-val">{remainingDocs}</span>
                            <span className="ad-quota-lbl">Remaining</span>
                        </div>
                    </div>

                    {/* Toggle Form Button */}
                    <button
                        type="button"
                        onClick={() => {
                            if (showForm && editingDoctor) {
                                resetForm();
                            } else {
                                setShowForm(!showForm);
                            }
                        }}
                        className={`ad-toggle-btn ${showForm ? 'btn-cancel' : ''}`}
                        disabled={isQuotaReached && !showForm}
                    >
                        {showForm ? 'Cancel' : '+ Add Doctor'}
                    </button>
                </div>
            </div>

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 18px', borderRadius: '12px', marginBottom: '20px', fontWeight: 600, fontSize: '13.5px' }}>⚠️ {error}</div>}
            {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '12px 18px', borderRadius: '12px', marginBottom: '20px', fontWeight: 600, fontSize: '13.5px' }}>✅ {success}</div>}

            {/* ==================== 2. ADD NEW DOCTOR FORM CARD (MATCHING SCREENSHOT) ==================== */}
            {showForm && (
                <div className="ad-form-card">
                    {/* Header with blue user icon and cyan ECG heartbeat wave */}
                    <div className="ad-form-header">
                        <div className="ad-form-header-badge">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="8.5" cy="7" r="4" />
                                <line x1="20" y1="8" x2="20" y2="14" />
                                <line x1="23" y1="11" x2="17" y2="11" />
                            </svg>
                        </div>
                        <h2 className="ad-form-title">
                            {editingDoctor ? `Edit: ${editingDoctor.name || editingDoctor.userId?.name || 'Doctor'}` : 'Add New Doctor'}
                            <span className="ad-ecg-pulse">ﮩ٨ـﮩـ</span>
                        </h2>
                    </div>

                    <form onSubmit={handleSubmit} className="ad-form-grid">
                        {/* 1. Name */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Name *</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-purple">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Enter doctor full name"
                                    className="ad-input-control"
                                    required
                                />
                            </div>
                        </div>

                        {/* 2. Email */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Email *</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-blue">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                        <polyline points="22,6 12,13 2,6" />
                                    </svg>
                                </div>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="Enter email address"
                                    className="ad-input-control"
                                    required
                                />
                            </div>
                        </div>

                        {/* 3. Phone */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Phone *</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-mint">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                    </svg>
                                </div>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    maxLength="10"
                                    onChange={(e) => {
                                        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                                        handleChange(e);
                                    }}
                                    placeholder="Enter phone number"
                                    className="ad-input-control"
                                    required
                                />
                            </div>
                        </div>

                        {/* 4. Password */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">{editingDoctor ? 'New Password (Optional)' : 'Password *'}</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-purple">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </div>
                                <div className="ad-password-field-wrap">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="Min 6 characters"
                                        required={!editingDoctor}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="ad-password-toggle"
                                        title={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 5. Gender */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Gender</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-cyan">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 8v8" />
                                        <path d="M8 12h8" />
                                    </svg>
                                </div>
                                <select
                                    name="gender"
                                    value={formData.gender}
                                    onChange={handleChange}
                                    className="ad-select-control"
                                >
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>

                        {/* 6. Experience */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Experience</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-amber">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    name="experience"
                                    value={formData.experience}
                                    onChange={handleChange}
                                    placeholder="e.g. 10 Years"
                                    className="ad-input-control"
                                />
                            </div>
                        </div>

                        {/* 7. Specialty */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Specialty</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-purple">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    name="specialty"
                                    value={formData.specialty}
                                    onChange={handleChange}
                                    placeholder="e.g. IVF Specialist"
                                    className="ad-input-control"
                                />
                            </div>
                        </div>

                        {/* 8. Consultation Fee (₹) */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Consultation Fee (₹)</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-emerald">
                                    <span style={{ fontWeight: 800, fontSize: '18px' }}>₹</span>
                                </div>
                                <input
                                    type="number"
                                    name="consultationFee"
                                    value={formData.consultationFee}
                                    onChange={handleChange}
                                    placeholder="Enter consultation fee"
                                    className="ad-input-control"
                                    min="0"
                                />
                            </div>
                        </div>

                        {/* 9. Education */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Education</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-blue">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                                        <path d="M6 12v5c3 3 9 3 12 0v-5" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    name="education"
                                    value={formData.education}
                                    onChange={handleChange}
                                    placeholder="e.g. MBBS, MD"
                                    className="ad-input-control"
                                />
                            </div>
                        </div>

                        {/* 10. Assign Department */}
                        <div className="ad-field-group">
                            <label className="ad-field-label">Assign Department (Optional)</label>
                            <div className="ad-input-wrapper">
                                <div className="ad-input-icon-box icon-teal">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="4" y="2" width="16" height="20" rx="2" />
                                        <path d="M9 22v-4h6v4" />
                                        <path d="M8 6h.01" />
                                        <path d="M16 6h.01" />
                                        <path d="M8 10h.01" />
                                        <path d="M16 10h.01" />
                                        <path d="M8 14h.01" />
                                        <path d="M16 14h.01" />
                                    </svg>
                                </div>
                                <select
                                    name="departments"
                                    value={formData.departments && formData.departments.length > 0 ? formData.departments[0] : ''}
                                    onChange={(e) => setFormData({ ...formData, departments: e.target.value ? [e.target.value] : [] })}
                                    className="ad-select-control"
                                >
                                    <option value="">Select Department</option>
                                    {hospital?.departments?.map(dept => (
                                        <option key={dept} value={dept}>{dept}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* 11. Weekly Availability & Timing Section */}
                        <div className="ad-availability-section">
                            <div className="ad-avail-header">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span>Weekly Availability & Timing</span>
                            </div>

                            <div className="ad-days-pills-row">
                                {days.map(day => {
                                    const isDayAvail = formData.availability?.[day]?.available || false;
                                    return (
                                        <div key={day} className={`ad-day-pill-card ${isDayAvail ? 'active' : ''}`}>
                                            <label className="ad-day-checkbox-label" htmlFor={`check-day-${day}`}>
                                                <input
                                                    type="checkbox"
                                                    id={`check-day-${day}`}
                                                    checked={isDayAvail}
                                                    onChange={(e) => handleAvailabilityChange(day, 'available', e.target.checked)}
                                                    className="ad-day-checkbox"
                                                />
                                                <span>{day}</span>
                                            </label>

                                            {isDayAvail && (
                                                <div className="ad-time-row">
                                                    <input
                                                        type="time"
                                                        value={formData.availability?.[day]?.startTime || '09:00'}
                                                        onChange={(e) => handleAvailabilityChange(day, 'startTime', e.target.value)}
                                                        className="ad-time-input"
                                                        title="Start time"
                                                    />
                                                    <input
                                                        type="time"
                                                        value={formData.availability?.[day]?.endTime || '17:00'}
                                                        onChange={(e) => handleAvailabilityChange(day, 'endTime', e.target.value)}
                                                        className="ad-time-input"
                                                        title="End time"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 12. Bio */}
                        <div className="ad-field-group full-width ad-bio-wrap">
                            <label className="ad-field-label">Bio</label>
                            <textarea
                                name="bio"
                                value={formData.bio}
                                onChange={handleChange}
                                placeholder="Doctor's profile bio..."
                                className="ad-bio-textarea"
                            />
                            <div className="ad-bio-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                            </div>
                        </div>

                        {/* Form Action Buttons */}
                        <div className="ad-form-actions-row">
                            <button
                                type="submit"
                                disabled={loading}
                                className="ad-btn-create"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                                <span>{loading ? 'Saving...' : editingDoctor ? 'Update Profile' : 'Create Doctor'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={resetForm}
                                className="ad-btn-cancel-plain"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                                <span>Cancel</span>
                            </button>
                        </div>
                    </form>

                    {/* Stethoscope Watermark Illustration */}
                    <div className="ad-stethoscope-watermark">
                        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                            <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                            <circle cx="20" cy="10" r="2" />
                        </svg>
                    </div>
                </div>
            )}

            {/* ==================== 3. ALL DOCTORS LIST SECTION ==================== */}
            <div className="ad-doctors-section">
                <div className="ad-doctors-header">
                    <div className="ad-section-title-wrap">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <h2>All Doctors</h2>
                        <span className="ad-section-badge">{filteredDoctors.length} Profiles</span>
                    </div>

                    <div className="ad-doctors-controls">
                        {/* Search Input */}
                        <div className="ad-search-box">
                            <svg className="ad-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search doctors..."
                                className="ad-search-input"
                            />
                        </div>

                        {/* Department Filter */}
                        {hospital?.departments?.length > 0 && (
                            <select
                                value={selectedDeptFilter}
                                onChange={e => setSelectedDeptFilter(e.target.value)}
                                className="ad-select-control"
                                style={{ height: '38px', width: 'auto', paddingRight: '32px' }}
                            >
                                <option value="ALL">All Departments</option>
                                {hospital.departments.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        )}

                        {/* View Toggle */}
                        <div className="ad-view-toggle-group">
                            <button
                                type="button"
                                className={`ad-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                onClick={() => setViewMode('grid')}
                                title="Grid view"
                            >
                                ▦
                            </button>
                            <button
                                type="button"
                                className={`ad-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                                onClick={() => setViewMode('table')}
                                title="Table view"
                            >
                                ☰
                            </button>
                        </div>
                    </div>
                </div>

                {loadingData ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
                        <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTop: '3px solid #0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                        <span>Loading doctor profiles...</span>
                    </div>
                ) : filteredDoctors.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                        <p style={{ margin: 0, fontSize: '15px', color: '#64748b', fontWeight: 600 }}>
                            {searchQuery || selectedDeptFilter !== 'ALL' ? 'No doctors match the search filter.' : 'No doctors registered yet.'}
                        </p>
                    </div>
                ) : viewMode === 'grid' ? (
                    /* Grid Cards View */
                    <div className="ad-doctors-grid">
                        {filteredDoctors.map(doctor => {
                            const docName = doctor.name || doctor.userId?.name || 'Unknown Name';
                            const docEmail = doctor.email || doctor.userId?.email || '—';
                            const avatar = doctor.userId?.avatar || doctor.image;

                            return (
                                <div key={doctor._id} className="ad-doctor-card">
                                    <div className="ad-doc-card-top">
                                        <div className="ad-doc-avatar-box">
                                            {avatar && (avatar.startsWith('http') || avatar.startsWith('/')) ? (
                                                <img src={avatar} alt={docName} className="ad-doc-avatar-img" />
                                            ) : (
                                                <span>{doctor.image || '👨‍⚕️'}</span>
                                            )}
                                        </div>

                                        <div className="ad-doc-main-info">
                                            <h3 className="ad-doc-name">{docName}</h3>
                                            <p className="ad-doc-specialty">{doctor.specialty || 'General Practitioner'}</p>
                                            <p className="ad-doc-email">{docEmail}</p>
                                        </div>
                                    </div>

                                    <div className="ad-doc-badges-row">
                                        {doctor.departments?.map((dept, i) => (
                                            <span key={i} className="ad-dept-badge">🏢 {dept}</span>
                                        ))}
                                        {doctor.consultationFee !== undefined && doctor.consultationFee !== null && (
                                            <span className="ad-fee-badge">₹{Number(doctor.consultationFee).toLocaleString('en-IN')} Fee</span>
                                        )}
                                        {doctor.experience && (
                                            <span className="ad-dept-badge" style={{ background: '#fffbeb', color: '#d97706', borderColor: '#fde68a' }}>
                                                ★ {doctor.experience}
                                            </span>
                                        )}
                                    </div>

                                    <div className="ad-doc-card-actions">
                                        <button
                                            type="button"
                                            onClick={() => handleViewDetails(doctor._id)}
                                            className="ad-card-btn ad-btn-view"
                                        >
                                            <span>Profile</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleEdit(doctor)}
                                            className="ad-card-btn ad-btn-edit"
                                        >
                                            <span>Edit</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(doctor._id)}
                                            className="ad-card-btn ad-btn-del"
                                            title="Delete Doctor"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Table View */
                    <div className="ad-table-wrap">
                        <table className="ad-doctors-table">
                            <thead>
                                <tr>
                                    <th>Doctor</th>
                                    <th>Email / Contact</th>
                                    <th>Specialty</th>
                                    <th>Department</th>
                                    <th>Fee</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDoctors.map(doctor => {
                                    const docName = doctor.name || doctor.userId?.name || 'Unknown Name';
                                    const docEmail = doctor.email || doctor.userId?.email || '—';
                                    const avatar = doctor.userId?.avatar || doctor.image;

                                    return (
                                        <tr key={doctor._id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                        {avatar && (avatar.startsWith('http') || avatar.startsWith('/')) ? (
                                                            <img src={avatar} alt={docName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <span>{doctor.image || '👨‍⚕️'}</span>
                                                        )}
                                                    </div>
                                                    <strong style={{ color: '#0f172a', fontWeight: 700 }}>{docName}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span>{docEmail}</span>
                                                    {doctor.phone && <small style={{ color: '#94a3b8' }}>{doctor.phone}</small>}
                                                </div>
                                            </td>
                                            <td><span style={{ fontWeight: 600, color: '#0284c7' }}>{doctor.specialty || '—'}</span></td>
                                            <td>
                                                {doctor.departments?.map((d, i) => (
                                                    <span key={i} className="ad-dept-badge" style={{ marginRight: '4px' }}>{d}</span>
                                                )) || <span style={{ color: '#94a3b8' }}>—</span>}
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 700, color: '#16a34a' }}>
                                                    ₹{Number(doctor.consultationFee || 0).toLocaleString('en-IN')}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    <button onClick={() => handleViewDetails(doctor._id)} className="ad-card-btn ad-btn-view" style={{ padding: '6px 10px' }}>View</button>
                                                    <button onClick={() => handleEdit(doctor)} className="ad-card-btn ad-btn-edit" style={{ padding: '6px 10px' }}>Edit</button>
                                                    <button onClick={() => handleDelete(doctor._id)} className="ad-card-btn ad-btn-del" style={{ padding: '6px 10px' }}>✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ==================== 4. DOCTOR PROFILE MODAL ==================== */}
            {(viewingDoctor || loadingDoctorDetails || viewDoctorError) && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}
                    onClick={() => { if (!loadingDoctorDetails) { setViewingDoctor(null); setViewDoctorError(''); } }}
                >
                    <div
                        style={{ maxWidth: '720px', width: '100%', background: '#ffffff', borderRadius: '20px', padding: '28px 32px', boxShadow: '0 20px 48px rgba(0,0,0,0.2)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => { setViewingDoctor(null); setViewDoctorError(''); }}
                            style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}
                        >
                            ✕
                        </button>

                        {loadingDoctorDetails && (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <div style={{ width: '40px', height: '40px', border: '4px solid #f1f5f9', borderTop: '4px solid #0284c7', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
                                <span style={{ color: '#64748b', fontWeight: 600 }}>Loading profile details...</span>
                            </div>
                        )}

                        {viewDoctorError && (
                            <div style={{ textAlign: 'center', padding: '30px 0' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>⚠️</div>
                                <p style={{ color: '#ef4444', fontWeight: 700 }}>{viewDoctorError}</p>
                            </div>
                        )}

                        {viewingDoctor && (
                            <div>
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '20px' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#eff6ff', border: '3px solid #0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontSize: '32px' }}>
                                        {viewingDoctor.userId?.avatar ? (
                                            <img src={viewingDoctor.userId.avatar} alt="Doctor" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            viewingDoctor.image || '👨‍⚕️'
                                        )}
                                    </div>
                                    <div>
                                        <h2 style={{ margin: '0 0 4px 0', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                                            {viewingDoctor.name || viewingDoctor.userId?.name || 'Doctor'}
                                        </h2>
                                        <p style={{ margin: 0, fontWeight: 700, color: '#0284c7', fontSize: '14px' }}>
                                            {viewingDoctor.specialty || 'General Practitioner'}
                                        </p>
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                            {viewingDoctor.departments?.map((d, i) => (
                                                <span key={i} className="ad-dept-badge">🏢 {d}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Email</label>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{viewingDoctor.email || viewingDoctor.userId?.email || '—'}</div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Phone</label>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{viewingDoctor.phone || viewingDoctor.userId?.phone || '—'}</div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Education</label>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{viewingDoctor.education || '—'}</div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Experience</label>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{viewingDoctor.experience || '—'}</div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Consultation Fee</label>
                                        <div style={{ fontWeight: 700, color: '#16a34a' }}>₹{Number(viewingDoctor.consultationFee || 0).toLocaleString('en-IN')}</div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Gender</label>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{viewingDoctor.gender || viewingDoctor.userId?.gender || '—'}</div>
                                    </div>
                                </div>

                                {viewingDoctor.bio && (
                                    <div style={{ marginTop: '18px', background: '#f8fafc', padding: '14px', borderRadius: '12px', borderLeft: '4px solid #0284c7' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Biography</label>
                                        <p style={{ margin: 0, fontStyle: 'italic', color: '#475569', fontSize: '13px' }}>"{viewingDoctor.bio}"</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDoctors;