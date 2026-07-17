//
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useAdminEntities } from '../../store/hooks';
import { fetchAdminDoctors, createDoctor, updateDoctor, deleteDoctor } from '../../store/slices/adminEntitiesSlice';
import { adminEntitiesAPI, hospitalAPI } from '../../utils/api';
import { getSubscriptionLimits } from '../../utils/subscriptionPlans';
import '../administration/SuperAdmin.css';

const AdminDoctors = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const { user } = useAuth();
    const { doctors: doctorsState } = useAdminEntities();

    const doctors = doctorsState.data;
    const loadingData = doctorsState.loading;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [editingDoctor, setEditingDoctor] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [hospital, setHospital] = useState(null);

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

    // Viewing doctor details modal state
    const [viewingDoctor, setViewingDoctor] = useState(null);
    const [loadingDoctorDetails, setLoadingDoctorDetails] = useState(false);
    const [viewDoctorError, setViewDoctorError] = useState('');

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
        consultationFee: 0
    };

    const [formData, setFormData] = useState(initialFormState);

    const availableServices = [
        { id: 'ivf', name: 'In Vitro Fertilization (IVF)' },
        { id: 'iui', name: 'Intrauterine Insemination (IUI)' },
        { id: 'icsi', name: 'Intracytoplasmic Sperm Injection' },
        { id: 'egg-freezing', name: 'Egg Freezing & Preservation' },
        { id: 'genetic-testing', name: 'Genetic Testing & Screening' },
        { id: 'donor-program', name: 'Egg & Sperm Donor Program' },
        { id: 'male-fertility', name: 'Male Fertility Treatment' },
        { id: 'surrogacy', name: 'Surrogacy Services' },
        { id: 'fertility-surgery', name: 'Fertility Surgery' }
    ];

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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
        setError('');
        setSuccess('');
    };

    const handleServiceChange = (e) => {
        const selectedServices = Array.from(e.target.selectedOptions, option => option.value);
        setFormData({ ...formData, services: selectedServices });
    };

    const handleAvailabilityChange = (day, field, value) => {
        setFormData(prev => ({
            ...prev,
            availability: {
                ...prev.availability,
                [day]: {
                    ...prev.availability[day],
                    [field]: field === 'available' ? value : value
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
                    setSuccess('Doctor updated successfully');
                    resetForm();
                    dispatch(fetchAdminDoctors()); // Refresh list
                } else {
                    setError(result.payload || 'Failed to update doctor');
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
                if (!formData.services || formData.services.length === 0) {
                    setError('Please select at least one service');
                    setLoading(false);
                    return;
                }

                const doctorData = {
                    ...formData,
                    consultationFee: formData.consultationFee ? Number(formData.consultationFee) : 0
                };

                const result = await dispatch(createDoctor(doctorData));
                if (createDoctor.fulfilled.match(result)) {
                    setSuccess('Doctor created successfully.');
                    resetForm();
                    dispatch(fetchAdminDoctors()); // Refresh list
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

    const renderAvailability = (availability) => {
        if (!availability) return 'No availability defined';
        const activeDays = Object.entries(availability).filter(([_, info]) => info.available);
        if (activeDays.length === 0) return 'Not available (No active days)';
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', marginTop: '4px' }}>
                {activeDays.map(([day, info]) => (
                    <div key={day} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '6px', fontSize: '11px' }}>
                        <strong style={{ textTransform: 'capitalize', color: '#1e293b', display: 'block' }}>{day}</strong>
                        <span style={{ color: '#64748b' }}>{info.startTime} - {info.endTime}</span>
                    </div>
                ))}
            </div>
        );
    };

    const handleEdit = (doctor) => {
        setEditingDoctor(doctor);

        // Merge existing availability with default structure
        const mergedAvailability = { ...defaultAvailability };
        if (doctor.availability) {
            Object.keys(doctor.availability).forEach(day => {
                if (mergedAvailability[day]) {
                    mergedAvailability[day] = { ...mergedAvailability[day], ...doctor.availability[day] };
                }
            });
        }

        setFormData({
            // Fallback to userId name if doctor.name is missing
            name: doctor.name || doctor.userId?.name || '',
            email: doctor.email,
            phone: doctor.phone || '',
            password: '', // Password not shown
            gender: doctor.userId?.gender || '',
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
            consultationFee: doctor.consultationFee || 0
        });
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this doctor?')) {
            await dispatch(deleteDoctor(id));
            setSuccess('Doctor deleted successfully');
            dispatch(fetchAdminDoctors()); // Refresh list
        }
    };

    const resetForm = () => {
        setFormData(initialFormState);
        setEditingDoctor(null);
        setShowForm(false);
    };

    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                <div className="admin-header">
                    <div>
                        <button
                            onClick={() => navigate(isHospitalAdmin ? '/hospitaladmin' : '/admin')}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            ← Back to {isHospitalAdmin ? 'Hospital Admin' : 'Dashboard'}
                        </button>
                        <h1>Manage Doctors</h1>
                        <p>Add and manage doctor profiles for the user platform.</p>
                    </div>
                    
                    {/* Quota Card */}
                    {(() => {
                        if (hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter')) {
                            const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                            const maxDoctors = limits.maxDoctors;
                            const doctorCount = doctors.length;
                            const remaining = Math.max(0, maxDoctors - doctorCount);
                            
                            return (
                                <div style={{ display: 'flex', gap: '20px', marginLeft: 'auto', marginRight: '20px', minWidth: '300px' }}>
                                    <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', flex: 1 }}>
                                        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>Doctors</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#334155' }}>{doctorCount} / {maxDoctors} Used</div>
                                    </div>
                                    <div style={{ background: remaining === 0 ? '#fee2e2' : '#f0fdf4', padding: '10px 14px', borderRadius: '8px', border: `1px solid ${remaining === 0 ? '#fecaca' : '#bbf7d0'}`, flex: 1 }}>
                                        <div style={{ color: remaining === 0 ? '#dc2626' : '#16a34a', fontSize: '11px', fontWeight: 600 }}>Remaining</div>
                                        <div style={{ fontSize: '16px', fontWeight: 700, color: remaining === 0 ? '#dc2626' : '#16a34a' }}>{remaining}</div>
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    <div>
                        <button 
                            onClick={() => setShowForm(!showForm)} 
                            className="btn btn-primary"
                            disabled={(() => {
                                if (hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter')) {
                                    const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                                    return doctors.length >= limits.maxDoctors;
                                }
                                return false;
                            })()}
                        >
                            {showForm ? 'Cancel' : '+ Add Doctor'}
                        </button>
                        {hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter') && (() => {
                            const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                            if (doctors.length >= limits.maxDoctors && !showForm) {
                                return (
                                    <div style={{ color: '#be123c', fontSize: '12px', fontWeight: 'bold', marginTop: '8px', textAlign: 'right' }}>
                                        ⚠️ Doctor quota reached.<br/>Upgrade to add more.
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {showForm && (
                    <div className="form-card">
                        <h2>{editingDoctor ? `Edit: ${editingDoctor.name || editingDoctor.userId?.name}` : 'Add New Doctor'}</h2>
                        <form onSubmit={handleSubmit}>
                            {/* Basic Info */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="name">Name *</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} required />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="email">Email *</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                                </div>
                            </div>

                            {/* Contact & Password */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="phone">Phone</label>
                                    <input pattern="\\d{10}" maxLength={10} required type="tel" name="phone" value={formData.phone} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="password">{editingDoctor ? 'New Password' : 'Password *'}</label>
                                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Min 6 characters" required={!editingDoctor} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label htmlFor="gender">Gender</label>
                                    <select name="gender" value={formData.gender} onChange={handleChange} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        <option value="">Select Gender</option>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>

                            {/* Professional Details */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="specialty">Specialty</label>
                                    <input type="text" name="specialty" value={formData.specialty} onChange={handleChange} placeholder="e.g. IVF Specialist" />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="experience">Experience</label>
                                    <input type="text" name="experience" value={formData.experience} onChange={handleChange} placeholder="e.g. 10 Years" />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="education">Education</label>
                                    <input type="text" name="education" value={formData.education} onChange={handleChange} placeholder="e.g. MBBS, MD" />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="consultationFee">Consultation Fee (₹)</label>
                                    <input type="number" name="consultationFee" value={formData.consultationFee} onChange={handleChange} placeholder="e.g. 500" min="0" />
                                </div>
                            </div>

                            {hospital && hospital.departments && hospital.departments.length > 0 && (
                                <div className="form-group" style={{ marginBottom: '15px' }}>
                                    <label htmlFor="departments">Assign Department (Optional - Leave blank to allow all)</label>
                                    <select 
                                        name="departments" 
                                        value={formData.departments && formData.departments.length > 0 ? formData.departments[0] : ''} 
                                        onChange={(e) => setFormData({ ...formData, departments: e.target.value ? [e.target.value] : [] })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                                    >
                                        <option value="">All Departments</option>
                                        {hospital.departments.map(dept => (
                                            <option key={dept} value={dept}>{dept}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label htmlFor="services">Services (Hold Ctrl/Cmd to select multiple) *</label>
                                <select name="services" multiple value={formData.services} onChange={handleServiceChange} required className="services-multiselect" size={5}>
                                    {availableServices.map(service => (
                                        <option key={service.id} value={service.id}>{service.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* --- AVAILABILITY SECTION --- */}
                            <div className="form-group availability-section">
                                <label style={{ fontSize: '1.1rem', marginBottom: '10px', display: 'block', fontWeight: '600' }}>Weekly Availability & Timing</label>
                                <div className="availability-grid">
                                    {days.map(day => (
                                        <div key={day} className="availability-day" style={{ padding: '10px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e0e0e0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
                                                <input
                                                    type="checkbox"
                                                    id={`check-${day}`}
                                                    checked={formData.availability?.[day]?.available || false}
                                                    onChange={(e) => handleAvailabilityChange(day, 'available', e.target.checked)}
                                                    style={{ marginRight: '10px', width: '18px', height: '18px' }}
                                                />
                                                <label htmlFor={`check-${day}`} style={{ fontWeight: 'bold', cursor: 'pointer', margin: 0, textTransform: 'capitalize' }}>
                                                    {day}
                                                </label>
                                            </div>

                                            {formData.availability?.[day]?.available && (
                                                <div className="time-inputs" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '30px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <small>Start</small>
                                                        <input
                                                            type="time"
                                                            value={formData.availability?.[day]?.startTime || ''}
                                                            onChange={(e) => handleAvailabilityChange(day, 'startTime', e.target.value)}
                                                            style={{ padding: '5px' }}
                                                        />
                                                    </div>
                                                    <span style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>to</span>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <small>End</small>
                                                        <input
                                                            type="time"
                                                            value={formData.availability?.[day]?.endTime || ''}
                                                            onChange={(e) => handleAvailabilityChange(day, 'endTime', e.target.value)}
                                                            style={{ padding: '5px' }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="bio">Bio</label>
                                <textarea name="bio" value={formData.bio} onChange={handleChange} rows="3" placeholder="Doctor's profile bio..." />
                            </div>

                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Saving...' : editingDoctor ? 'Update Profile' : 'Create Doctor'}
                                </button>
                                <button type="button" onClick={resetForm} className="btn btn-secondary">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Department Breakdown */}
                {doctors.length > 0 && (() => {
                    const deptMap = {};
                    doctors.forEach(doc => {
                        const depts = doc.departments?.length ? doc.departments : [doc.specialty || 'Unassigned'];
                        depts.forEach(dept => {
                            deptMap[dept] = (deptMap[dept] || 0) + 1;
                        });
                    });
                    return (
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <h2 style={{ marginBottom: '14px' }}>Doctors by Department</h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {Object.entries(deptMap).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                                    <div key={dept} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '120px' }}>
                                        <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1d4ed8' }}>{count}</span>
                                        <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '600', textAlign: 'center', marginTop: '2px' }}>{dept}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {/* Doctor List */}
                <div className="users-table">
                    <h2>All Doctors</h2>
                    {loadingData ? (
                        <div className="loading-message">Loading doctors...</div>
                    ) : doctors.length === 0 ? (
                        <div className="empty-message">No doctors found.</div>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Specialty</th>
                                    <th>Departments</th>
                                    <th>Services</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {doctors.map((doctor) => (
                                    <tr key={doctor._id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>{doctor.image}</span>
                                                {/* FALLBACK: If doctor.name is empty, use userId.name */}
                                                <strong>{doctor.name || doctor.userId?.name || 'Unknown Name'}</strong>
                                            </div>
                                        </td>
                                        <td>{doctor.email}</td>
                                        <td>{doctor.specialty || '-'}</td>
                                        <td>
                                            {doctor.departments?.length
                                                ? doctor.departments.map((d, i) => (
                                                    <span key={i} style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', borderRadius: '4px', padding: '2px 7px', fontSize: '11px', fontWeight: '600', marginRight: '4px', marginBottom: '2px' }}>{d}</span>
                                                ))
                                                : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td>{doctor.services?.length || 0}</td>
                                        <td>
                                            <div className="action-buttons" style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleViewDetails(doctor._id)}
                                                    className="btn-edit"
                                                    style={{ backgroundColor: '#1976d2', color: 'white' }}
                                                >
                                                    ℹ️ Personal Info
                                                </button>
                                                <button onClick={() => handleDelete(doctor._id)} className="btn-delete">Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Doctor Details Modal */}
            {(viewingDoctor || loadingDoctorDetails || viewDoctorError) && (
                <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => { if (!loadingDoctorDetails) { setViewingDoctor(null); setViewDoctorError(''); } }}>
                    <div className="modal-content" style={{ maxWidth: '750px', width: '95%', padding: '28px', borderRadius: '20px', position: 'relative', background: '#ffffff', color: '#1e293b', boxShadow: '0 20px 48px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
                        
                        {/* Close button */}
                        <button 
                            onClick={() => { setViewingDoctor(null); setViewDoctorError(''); }}
                            style={{ position: 'absolute', right: '20px', top: '20px', background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#94a3b8', transition: 'color 0.2s' }}
                            onMouseOver={(e) => e.target.style.color = '#ef4444'}
                            onMouseOut={(e) => e.target.style.color = '#94a3b8'}
                        >
                            ✕
                        </button>

                        {loadingDoctorDetails && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '320px', gap: '16px' }}>
                                <div style={{ width: '45px', height: '45px', border: '4px solid #f1f5f9', borderTop: '4px solid #14b8a6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <span style={{ color: '#64748b', fontWeight: 600, fontSize: '14px' }}>Fetching doctor profile details...</span>
                                <style>{`
                                    @keyframes spin {
                                        0% { transform: rotate(0deg); }
                                        100% { transform: rotate(360deg); }
                                    }
                                `}</style>
                            </div>
                        )}

                        {viewDoctorError && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '320px', gap: '20px', textAlign: 'center' }}>
                                <div style={{ fontSize: '3.5rem' }}>⚠️</div>
                                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '15px' }}>{viewDoctorError}</span>
                                <button className="btn btn-secondary" style={{ padding: '10px 24px', borderRadius: '10px', fontWeight: 'bold' }} onClick={() => { setViewingDoctor(null); setViewDoctorError(''); }}>Close</button>
                            </div>
                        )}

                        {viewingDoctor && (
                            <div className="doctor-profile-modal-body" style={{ animation: 'fadeIn 0.25s ease' }}>
                                {/* Header section with Photo, Name & Specialty */}
                                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px', marginBottom: '20px' }}>
                                    {/* Avatar Photo */}
                                    {(() => {
                                        const avatar = viewingDoctor.userId?.avatar || viewingDoctor.image;
                                        if (avatar && (avatar.startsWith('http') || avatar.startsWith('/'))) {
                                            return <img src={avatar} alt={viewingDoctor.name} style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: '3px solid #14b8a6' }} />;
                                        }
                                        return (
                                            <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: '#f0fdfa', border: '3px solid #14b8a6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
                                                {avatar || '👨‍⚕️'}
                                            </div>
                                        );
                                    })()}

                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                                            <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
                                                {viewingDoctor.name || viewingDoctor.userId?.name || 'Unknown Name'}
                                            </h2>
                                        </div>
                                        <p style={{ margin: '6px 0 0', fontWeight: '700', color: '#0d9488', fontSize: '1rem' }}>
                                            {viewingDoctor.specialty || 'General Practitioner'}
                                        </p>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                                            {viewingDoctor.departments?.map((dept, idx) => (
                                                <span key={idx} style={{ background: '#f0fdfa', color: '#0d9488', fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '6px', border: '1px solid #ccfbef' }}>
                                                    🏢 {dept}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Main details grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px', marginBottom: '8px' }}>
                                    
                                    {/* Column 1: Contact & Demographics */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <h3 style={{ fontSize: '13px', margin: '0 0 4px 0', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>
                                            Contact & Demographics
                                        </h3>
                                        
                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Email Address</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{viewingDoctor.email || viewingDoctor.userId?.email || '—'}</span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Mobile Number</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{viewingDoctor.phone || viewingDoctor.userId?.phone || '—'}</span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Gender</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600, textTransform: 'capitalize' }}>
                                                {viewingDoctor.userId?.gender || '—'}
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Date of Birth</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>
                                                {viewingDoctor.userId?.dob ? new Date(viewingDoctor.userId.dob).toLocaleDateString('en-IN') : '—'}
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Residential Address</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{viewingDoctor.userId?.address || '—'}</span>
                                        </div>
                                    </div>

                                    {/* Column 2: Professional Info */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <h3 style={{ fontSize: '13px', margin: '0 0 4px 0', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '800' }}>
                                            Professional Profile
                                        </h3>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Registration Number / Doc ID</label>
                                            <span style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 700, fontFamily: 'monospace' }}>
                                                {viewingDoctor.doctorId || '—'}
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Department</label>
                                            <span style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 700 }}>
                                                {viewingDoctor.departments && viewingDoctor.departments.length > 0 ? viewingDoctor.departments[0] : 'All Departments'}
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Qualification / Education</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{viewingDoctor.education || '—'}</span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Years of Experience</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>{viewingDoctor.experience || '—'}</span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Consultation Fee</label>
                                            <span style={{ fontSize: '13.5px', color: '#16a34a', fontWeight: 700 }}>
                                                ₹{Number(viewingDoctor.consultationFee || 0).toLocaleString('en-IN')}
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Joining Date</label>
                                            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 600 }}>
                                                {viewingDoctor.createdAt ? new Date(viewingDoctor.createdAt).toLocaleDateString('en-IN') : '—'}
                                            </span>
                                        </div>

                                        <div>
                                            <label style={{ fontSize: '10px', color: '#94a3b8', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Status</label>
                                            <span style={{ display: 'inline-block', fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', marginTop: '2px' }}>
                                                Active
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Availability & Bio section */}
                                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '16px', paddingTop: '16px' }}>
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Weekly Availability & timing</label>
                                        {renderAvailability(viewingDoctor.availability)}
                                    </div>

                                    {viewingDoctor.bio && (
                                        <div>
                                            <label style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Biography</label>
                                            <p style={{ margin: 0, fontSize: '13px', color: '#475569', fontStyle: 'italic', background: '#f8fafc', padding: '12px', borderRadius: '10px', borderLeft: '4px solid #14b8a6', lineHeight: 1.5 }}>
                                                "{viewingDoctor.bio}"
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDoctors;