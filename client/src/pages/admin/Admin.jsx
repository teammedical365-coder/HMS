import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminAPI, uploadAPI, hospitalAPI } from '../../utils/api';
import { getSubscriptionLimits } from '../../utils/subscriptionPlans';
import '../administration/SuperAdmin.css';

const Admin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [roles, setRoles] = useState([]);
    const [hospital, setHospital] = useState(null);

    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        id: '', name: '', email: '', phone: '', roleId: '', currentAvatar: '', newAvatarFile: null, specialty: '', department: ''
    });
    const [updating, setUpdating] = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Create Staff Form state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', email: '', password: '', phone: '', age: '', aadhaar: '', roleId: '', file: null, department: ''
    });
    const [creating, setCreating] = useState(false);
    const [clinicDoctorExists, setClinicDoctorExists] = useState(false);
    const [checkingDocLimit, setCheckingDocLimit] = useState(false);

    const [hospitals, setHospitals] = useState([]);
    const [staffHospitalFilter, setStaffHospitalFilter] = useState('');
    const [staffPlanFilter, setStaffPlanFilter] = useState('');

    const handleToggleCreateForm = async () => {
        const nextState = !showCreateForm;
        if (nextState && hospital?.clinicType === 'clinic') {
            setCheckingDocLimit(true);
            setError('');
            try {
                const response = await adminAPI.getUsers();
                if (response.success) {
                    const staffUsers = response.users || [];
                    const hasDoc = staffUsers.some(u => {
                        const rName = (u.role || '').toLowerCase();
                        return rName === 'clinic doctor' || rName === 'doctor';
                    });
                    setClinicDoctorExists(hasDoc);
                }
            } catch (err) {
                console.error("Error rechecking Clinic Doctor count:", err);
            } finally {
                setCheckingDocLimit(false);
            }
        }
        setShowCreateForm(nextState);
    };

    // Reactive check to sync Clinic Doctor count status
    useEffect(() => {
        if (hospital?.clinicType === 'clinic') {
            const hasDoc = users.some(u => {
                const rName = (u.role || '').toLowerCase();
                return rName === 'clinic doctor' || rName === 'doctor';
            });
            setClinicDoctorExists(hasDoc);
        }
    }, [users, hospital]);

    // Check if user is admin
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const perms = user.permissions || [];
        const allowedRoles = ['admin', 'superadmin', 'centraladmin', 'hospitaladmin'];
        if (!allowedRoles.includes(user.role) &&
            !perms.includes('*') && !perms.includes('admin_manage_roles') && !perms.includes('admin_view_stats')) {
            navigate('/');
        }
    }, [navigate]);

    useEffect(() => {
        if (location.state?.openCreateForm) {
            setShowCreateForm(true);
        }
    }, [location.state]);

    useEffect(() => {
        fetchUsers();
        fetchRoles();
        fetchHospital();
        
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (['superadmin', 'centraladmin'].includes(user.role)) {
            fetchHospitals();
        }
    }, []);

    const fetchHospitals = async (plan = staffPlanFilter) => {
        try {
            const res = await hospitalAPI.getHospitals(plan === '' ? 'all' : plan);
            if (res.success) setHospitals(res.hospitals || []);
        } catch (err) { console.error('Error fetching hospitals:', err); }
    };

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

    // UPI Management State & Functions
    const [upiList, setUpiList] = useState([]);
    const [newLabel, setNewLabel] = useState('');
    const [newUpiId, setNewUpiId] = useState('');
    const [upiLoading, setUpiLoading] = useState(false);
    const [upiError, setUpiError] = useState('');
    const [upiSuccess, setUpiSuccess] = useState('');

    const fetchUpiIds = async () => {
        try {
            const res = await hospitalAPI.getUpiIds();
            if (res.success) setUpiList(res.upiIds || []);
        } catch (err) {
            console.error('Error fetching UPI IDs:', err);
        }
    };

    useEffect(() => {
        if (hospital) fetchUpiIds();
    }, [hospital]);

    const handleAddUpi = () => {
        if (!newLabel.trim() || !newUpiId.trim()) {
            setUpiError('Both label and UPI ID are required');
            return;
        }
        setUpiList(prev => [...prev, { label: newLabel.trim(), upiId: newUpiId.trim() }]);
        setNewLabel('');
        setNewUpiId('');
        setUpiError('');
    };

    const handleDeleteUpi = (index) => {
        setUpiList(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveUpi = async () => {
        setUpiLoading(true);
        setUpiError('');
        setUpiSuccess('');
        try {
            const res = await hospitalAPI.updateUpiIds(upiList);
            if (res.success) {
                setUpiSuccess('UPI IDs updated');
            } else {
                setUpiError('Failed to update UPI IDs');
            }
        } catch (err) {
            setUpiError(err.response?.data?.message || 'Error updating UPI IDs');
        } finally {
            setUpiLoading(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await adminAPI.getRoles();
            if (response.success) setRoles(response.data);
        } catch (err) {
            console.error('Error fetching roles:', err);
        }
    };

    const fetchUsers = async (plan = staffPlanFilter, hospitalId = staffHospitalFilter) => {
        try {
            setLoadingUsers(true);
            const response = await adminAPI.getUsers(plan, hospitalId);
            if (response.success) {
                const userObj = JSON.parse(localStorage.getItem('user') || '{}');
                const isCentral = ['superadmin', 'centraladmin'].includes(userObj.role);
                const staffUsers = response.users.filter(u => {
                    const r = (u.role || '').toLowerCase();
                    if (['patient', 'user'].includes(r)) return false;
                    if (!isCentral && r.includes('doctor')) return false;
                    return true;
                });
                setUsers(staffUsers);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Error fetching users');
        } finally {
            setLoadingUsers(false);
        }
    };

    // ... (rest of code)



    // Open Edit Modal
    const openEditModal = (userItem) => {
        setEditForm({
            id: userItem.id || userItem._id,
            name: userItem.name,
            email: userItem.email,
            phone: userItem.phone || '',
            roleId: userItem.roleId || userItem.role, // role might be name or ID depending on populate
            currentAvatar: userItem.avatar,
            newAvatarFile: null,
            specialty: '', // Ideally fetch specific doctor details if needed, but basic update is fine
            department: (userItem.departments && userItem.departments.length > 0) ? userItem.departments[0] : ''
        });
        setEditModal(true);
        setError('');
        setSuccess('');
    };

    // Update User Logic
    const handleUpdateUser = async (e) => {
        e.preventDefault();
        setUpdating(true);
        setError('');
        setSuccess('');

        if (editForm.phone && editForm.phone.length !== 10) {
            setError('Mobile number must be exactly 10 digits.');
            setUpdating(false);
            return;
        }

        try {
            let avatarUrl = editForm.currentAvatar;

            // 1. Upload new image if selected
            if (editForm.newAvatarFile) {
                const formData = new FormData();
                formData.append('images', editForm.newAvatarFile);
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) {
                    avatarUrl = uploadRes.files[0].url;
                }
            }

            // 2. Prepare Update Data
            const updateData = {
                name: editForm.name,
                email: editForm.email,
                phone: editForm.phone,
                roleId: editForm.roleId,
                avatar: avatarUrl,
                specialty: editForm.specialty,
                departments: editForm.department ? [editForm.department] : []
            };

            const response = await adminAPI.updateUser(editForm.id, updateData);
            if (response.success) {
                setSuccess('User updated successfully!');
                setEditModal(false);
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error updating user.');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        try {
            const response = await adminAPI.deleteUser(userId);
            if (response.success) {
                setSuccess('User deleted successfully!');
                setDeleteConfirm(null);
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error deleting user.');
            setDeleteConfirm(null);
        }
    };

    // Create Staff Account
    const handleCreateStaff = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError('');
        setSuccess('');

        if (createForm.phone && createForm.phone.length !== 10) {
            setError('Mobile number must be exactly 10 digits.');
            setCreating(false);
            return;
        }

        if (!createForm.name || !createForm.email || !createForm.password || !createForm.roleId) {
            setError('Name, email, password, and role are all required.');
            setCreating(false);
            return;
        }

        if (hospital?.clinicType === 'clinic') {
            try {
                const response = await adminAPI.getUsers();
                if (response.success) {
                    const staffUsers = response.users || [];
                    const hasDoc = staffUsers.some(u => {
                        const rName = (u.role || '').toLowerCase();
                        return rName === 'clinic doctor' || rName === 'doctor';
                    });
                    if (hasDoc) {
                        setError('This clinic already has an assigned Clinic Doctor.');
                        setClinicDoctorExists(true);
                        setCreating(false);
                        return;
                    }
                }
            } catch (err) {
                console.error("Error checking clinic doctor before submit:", err);
            }
        }

        try {
            let avatarUrl = null;

            // 1. Upload Image if selected
            if (createForm.file) {
                const formData = new FormData();
                formData.append('images', createForm.file);
                try {
                    const uploadRes = await uploadAPI.uploadImages(formData);
                    if (uploadRes.success && uploadRes.urls && uploadRes.urls.length > 0) {
                        avatarUrl = uploadRes.urls[0];
                    } else if (uploadRes.success && uploadRes.files && uploadRes.files.length > 0) {
                        avatarUrl = uploadRes.files[0].url;
                    }
                } catch (uploadErr) {
                    console.error("Image upload failed:", uploadErr);
                    // continue without image if upload fails or notify user
                }
            }

            // 2. Create User with avatar URL
            const userData = {
                ...createForm,
                departments: createForm.department ? [createForm.department] : [],
                avatar: avatarUrl
            };

            const response = await adminAPI.createUser(userData);
            if (response.success) {
                setSuccess(`✅ ${response.user?.role?.name || 'Staff'} account created! They can log in with: ${createForm.email}`);
                setCreateForm({ name: '', email: '', password: '', phone: '', age: '', aadhaar: '', roleId: '', file: null, department: '', hospitalId: '' });
                setShowCreateForm(false);
                fetchUsers();
            }
        } catch (err) {
            console.error("Creation error:", err);
            setError(err.response?.data?.message || 'Error creating staff account.');
        } finally {
            setCreating(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/');
    };

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                {/* Header */}
                <div className="admin-header">
                    <div>
                        <h1>Admin Dashboard</h1>
                        <p>Manage staff accounts, roles, and permissions</p>
                    </div>
                    <div className="admin-user-info">
                        <span>Welcome, {user.name}</span>
                        <button onClick={() => navigate('/admin/roles')} className="btn-edit" style={{ marginRight: '10px', padding: '8px 16px' }}>🔑 Manage Roles</button>
                        <button onClick={handleLogout} className="logout-btn">Logout</button>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {/* Quota Card */}
                {(() => {
                    if (hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter')) {
                        const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                        const maxStaff = limits.maxStaff;
                        const staffCount = users.filter(u => {
                            const rName = (u.role?.name || u.role || '').toLowerCase();
                            return !rName.includes('doctor') && !['patient', 'hospitaladmin', 'centraladmin', 'superadmin'].includes(rName);
                        }).length;
                        const remaining = Math.max(0, maxStaff - staffCount);
                        
                        return (
                            <div className="admin-card" style={{ marginBottom: '20px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>📊 Subscription Quota (Staff)</h3>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', flex: 1 }}>
                                        <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>Staff Accounts</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#334155' }}>{staffCount} / {maxStaff} Used</div>
                                    </div>
                                    <div style={{ background: remaining === 0 ? '#fee2e2' : '#f0fdf4', padding: '12px 16px', borderRadius: '8px', border: `1px solid ${remaining === 0 ? '#fecaca' : '#bbf7d0'}`, flex: 1 }}>
                                        <div style={{ color: remaining === 0 ? '#dc2626' : '#16a34a', fontSize: '12px', fontWeight: 600 }}>Remaining</div>
                                        <div style={{ fontSize: '20px', fontWeight: 700, color: remaining === 0 ? '#dc2626' : '#16a34a' }}>{remaining}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()}



                {/* Users List */}
                <div className="admin-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                            <h2 style={{ margin: 0 }}>👥 Add New Staff Member</h2>
                        </div>
                        <button
                            onClick={handleToggleCreateForm}
                            className={showCreateForm ? 'btn-cancel' : 'btn-save'}
                            style={{ padding: '8px 20px', fontSize: '14px' }}
                            disabled={checkingDocLimit || (() => {
                                if (hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter')) {
                                    const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                                    const maxStaff = limits.maxStaff;
                                    return users.length >= maxStaff;
                                }
                                return false;
                            })()}
                        >
                            {checkingDocLimit ? 'Checking...' : showCreateForm ? 'Cancel' : '+ New Staff'}
                        </button>
                    </div>
                    
                    {hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter') && (() => {
                        const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                        const maxStaff = limits.maxStaff;
                        if (users.length >= maxStaff && !showCreateForm) {
                            return (
                                <div style={{ color: '#be123c', background: '#fff1f2', border: '1px solid #fda4af', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontWeight: 'bold', fontSize: '14px' }}>
                                    ⚠️ Staff quota reached. Upgrade your subscription to add more staff.
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Move the Create Form here, just below the header */}
                    {showCreateForm && (
                        <div style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #e2e8f0' }}>
                            <form onSubmit={handleCreateStaff} className="user-form">
                                {hospital?.clinicType === 'clinic' && clinicDoctorExists && (
                                    <div style={{ color: '#be123c', background: '#fff1f2', border: '1px solid #fda4af', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}>
                                        ⚠️ This clinic already has an assigned Clinic Doctor.
                                    </div>
                                )}
                                {['superadmin', 'centraladmin'].includes(JSON.parse(localStorage.getItem('user') || '{}').role) && (
                                    <div className="form-row">
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="staff-label">Assign Hospital *</label>
                                            <select className="staff-input" value={createForm.hospitalId} onChange={e => setCreateForm({ ...createForm, hospitalId: e.target.value })} required
                                                style={{ borderColor: !createForm.hospitalId ? '#e53935' : undefined }}>
                                                <option value="">-- Select Hospital (Required) --</option>
                                                {[...hospitals].sort((a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase())).map(h => <option key={h._id} value={h._id}>{h.name}{h.city ? ` — ${h.city}` : ''}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                )}
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Name *</label>
                                        <input type="text" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Email *</label>
                                        <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required className="staff-input" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Password *</label>
                                        <input type="text" placeholder="Set a temporary password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required className="staff-input" />
                                        <small className="form-hint">Share this password with the staff member</small>
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Phone *</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. 9876543210" 
                                            value={createForm.phone || ''} 
                                            onChange={e => {
                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                setCreateForm({ ...createForm, phone: cleanVal });
                                            }} 
                                            className="staff-input" 
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Age</label>
                                        <input type="number" placeholder="e.g. 30" value={createForm.age || ''} onChange={e => setCreateForm({ ...createForm, age: e.target.value })} className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Aadhaar Number</label>
                                        <input 
                                            type="text" 
                                            placeholder="12-digit Aadhaar" 
                                            maxLength="12"
                                            value={createForm.aadhaar || ''} 
                                            onChange={e => {
                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 12);
                                                setCreateForm({ ...createForm, aadhaar: cleanVal });
                                            }} 
                                            className="staff-input" 
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Profile Image Upload</label>
                                        <input type="file" accept="image/*" onChange={e => setCreateForm({ ...createForm, file: e.target.files[0] })} className="staff-input" style={{ padding: '8px' }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Assign Role * <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '0.85rem', textTransform: 'none' }}>(Don't see your role? <a href="/admin/roles" style={{ color: '#0ea5e9' }}>Create one here</a>)</span></label>
                                        <select value={createForm.roleId} onChange={e => setCreateForm({ ...createForm, roleId: e.target.value })} required className="staff-input">
                                            <option value="">Select Role</option>
                                            {roles
                                                .filter(r => {
                                                    const name = r.name.toLowerCase();
                                                    if (name.includes('doctor')) return false;
                                                    return !['patient', 'user', 'admin', 'hospitaladmin', 'centraladmin', 'superadmin'].includes(name);
                                                })
                                                .map(role => (
                                                    <option key={role._id} value={role._id}>
                                                        {role.name} {role.description ? `— ${role.description}` : ''}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                </div>

                                {hospital && hospital.departments && hospital.departments.length > 0 && (
                                    <div className="form-row" style={{ marginTop: '10px' }}>
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="staff-label">Assign Department (Optional - Leave blank to allow all)</label>
                                            <select 
                                                value={createForm.department} 
                                                onChange={(e) => setCreateForm(prev => ({ ...prev, department: e.target.value }))}
                                                className="staff-input"
                                                style={{ marginTop: '8px' }}
                                            >
                                                <option value="">-- All Departments --</option>
                                                {hospital.departments.map((dept, i) => (
                                                    <option key={i} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <button type="submit" disabled={creating} className="btn-save" style={{ marginTop: '20px', width: '100%' }}>
                                    {creating ? 'Creating...' : 'Create Staff Account'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>

                {/* Staff list with hospital filter */}
                <div className="admin-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <h2>All Staff ({users.length})</h2>
                        {['superadmin', 'centraladmin'].includes(JSON.parse(localStorage.getItem('user') || '{}').role) && (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <select className="staff-input" style={{ width: '200px' }} value={staffPlanFilter} onChange={e => { 
                                    const newPlan = e.target.value;
                                    setStaffPlanFilter(newPlan); 
                                    setStaffHospitalFilter(''); 
                                    fetchUsers(newPlan, '');
                                    fetchHospitals(newPlan);
                                }}>
                                    <option value="">All Plans</option>
                                    <option value="starter">Simple Clinics (Starter)</option>
                                    <option value="clinic_basic">Clinic Basic</option>
                                    <option value="multi_speciality_starter">Multi-Speciality Starter</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                                <select className="staff-input" style={{ width: '240px' }} value={staffHospitalFilter} onChange={e => {
                                    const newHosp = e.target.value;
                                    setStaffHospitalFilter(newHosp);
                                    fetchUsers(staffPlanFilter, newHosp);
                                }}>
                                    <option value="">All Hospitals</option>
                                    {[...hospitals]
                                        .sort((a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase()))
                                        .map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                    {loadingUsers ? (
                        <div className="loading-message">Loading users...</div>
                    ) : users.length === 0 ? (
                        <div className="empty-message">No users found for this selection</div>
                    ) : (
                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Avatar</th>
                                        <th>Name</th>
                                        <th>Hospital</th>
                                        <th>Role</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users
                                        .map((userItem) => {
                                            const isCurrentUser = (userItem.id || userItem._id) === JSON.parse(localStorage.getItem('user') || '{}').id;
                                            const canModify = !isCurrentUser;

                                            return (
                                                <tr key={userItem.id || userItem._id}>
                                                    <td>
                                                        {userItem.avatar ? (
                                                            <img src={userItem.avatar} alt={userItem.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1', fontSize: '14px' }}>
                                                                {userItem.name?.charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontWeight: 500 }}>{userItem.name}</td>
                                                    <td>
                                                        <span style={{ background: '#f0f9ff', color: '#0284c7', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                                            {userItem.hospitalId ? (hospitals.find(h => h._id === String(userItem.hospitalId))?.name || hospital?.name || 'Unknown') : '⚠️ No hospital'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`role-badge role-${(userItem.role || '').toLowerCase()}`}>
                                                            {(userItem.role || 'No Role').toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td>{userItem.email}</td>
                                                    <td>{userItem.phone || '—'}</td>
                                                    <td>
                                                        <div className="action-buttons">
                                                            {canModify && (
                                                                <>
                                                                    <button onClick={() => openEditModal(userItem)} className="btn-edit">Edit</button>
                                                                    <button onClick={() => setDeleteConfirm(userItem.id || userItem._id)} className="btn-delete">Delete</button>
                                                                </>
                                                            )}
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


                {/* EDIT USER MODAL */}
                {editModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{ maxWidth: '600px' }}>
                            <h3>Edit Staff Details</h3>
                            <form onSubmit={handleUpdateUser} className="user-form">
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px' }}>
                                    <div>
                                        {editForm.newAvatarFile ? (
                                            <img src={URL.createObjectURL(editForm.newAvatarFile)} alt="Preview" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : editForm.currentAvatar ? (
                                            <img src={editForm.currentAvatar} alt="Current" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#cbd5e1' }}></div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="staff-label">Change Photo</label>
                                        <input type="file" accept="image/*" onChange={e => setEditForm({ ...editForm, newAvatarFile: e.target.files[0] })} className="staff-input" style={{ padding: '8px' }} />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Name</label>
                                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Email</label>
                                        <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required className="staff-input" />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Phone</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. 9876543210"
                                            value={editForm.phone || ''}
                                            onChange={e => {
                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                setEditForm({ ...editForm, phone: cleanVal });
                                            }}
                                            className="staff-input"
                                         maxLength="10"  pattern="\d{10}"  title="Phone number must be exactly 10 digits" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Role</label>
                                        <select value={editForm.roleId} onChange={e => setEditForm({ ...editForm, roleId: e.target.value })} required disabled className="staff-input">
                                            {roles
                                                .filter(r => !['patient', 'user'].includes(r.name.toLowerCase()))
                                                .filter(r => {
                                                    const isClinic = hospital?.clinicType === 'clinic';
                                                    const name = r.name.toLowerCase();
                                                    if (isClinic) {
                                                        return name === 'clinic doctor';
                                                    } else {
                                                        return !name.includes('clinic');
                                                    }
                                                })
                                                .map(role => (
                                                    <option key={role._id} value={role._id}>{role.name}</option>
                                                ))}
                                        </select>
                                    </div>
                                </div>


                                {hospital && hospital.departments && hospital.departments.length > 0 && (
                                    <div className="form-row" style={{ marginTop: '10px' }}>
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="staff-label">Assign Department (Optional - Leave blank to allow all)</label>
                                            <select
                                                value={editForm.department}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                                                className="staff-input"
                                                style={{ marginTop: '8px' }}
                                            >
                                                <option value="">-- Select Department --</option>
                                                {hospital.departments.map(dept => (
                                                    <option key={dept} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div className="modal-buttons" style={{ marginTop: '20px' }}>
                                    <button type="submit" disabled={updating} className="btn-save">
                                        {updating ? 'Saving...' : 'Save Changes'}
                                    </button>
                                    <button type="button" onClick={() => setEditModal(false)} className="btn-cancel">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {deleteConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Confirm Delete</h3>
                            <p>Are you sure? This action cannot be undone.</p>
                            <div className="modal-buttons">
                                <button onClick={() => handleDeleteUser(deleteConfirm)} className="btn-confirm-delete">Delete</button>
                                <button onClick={() => setDeleteConfirm(null)} className="btn-cancel">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Admin;