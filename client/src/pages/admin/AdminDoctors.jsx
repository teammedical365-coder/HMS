//
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAuth, useAdminEntities } from '../../store/hooks';
import { fetchAdminDoctors, createDoctor, updateDoctor, deleteDoctor } from '../../store/slices/adminEntitiesSlice';
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
        specialty: '',
        experience: '',
        education: '',
        services: [],
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
            specialty: doctor.specialty || '',
            experience: doctor.experience || '',
            education: doctor.education || '',
            services: doctor.services || [],
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
                    <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
                        {showForm ? 'Cancel' : '+ Add Doctor'}
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {showForm && (
                    <div className="form-card animate-on-scroll slide-up">
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
                                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="password">{editingDoctor ? 'New Password' : 'Password *'}</label>
                                    <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Min 6 characters" required={!editingDoctor} />
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

                            <div className="form-group">
                                <label htmlFor="education">Education</label>
                                <input type="text" name="education" value={formData.education} onChange={handleChange} placeholder="e.g. MBBS, MD" />
                            </div>

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
                                                    checked={formData.availability[day]?.available || false}
                                                    onChange={(e) => handleAvailabilityChange(day, 'available', e.target.checked)}
                                                    style={{ marginRight: '10px', width: '18px', height: '18px' }}
                                                />
                                                <label htmlFor={`check-${day}`} style={{ fontWeight: 'bold', cursor: 'pointer', margin: 0, textTransform: 'capitalize' }}>
                                                    {day}
                                                </label>
                                            </div>

                                            {formData.availability[day]?.available && (
                                                <div className="time-inputs" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '30px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <small>Start</small>
                                                        <input
                                                            type="time"
                                                            value={formData.availability[day].startTime}
                                                            onChange={(e) => handleAvailabilityChange(day, 'startTime', e.target.value)}
                                                            style={{ padding: '5px' }}
                                                        />
                                                    </div>
                                                    <span style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>to</span>
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <small>End</small>
                                                        <input
                                                            type="time"
                                                            value={formData.availability[day].endTime}
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
                                                    onClick={() => handleEdit(doctor)}
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
        </div>
    );
};

export default AdminDoctors;