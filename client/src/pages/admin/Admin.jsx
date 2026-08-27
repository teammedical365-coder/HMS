import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminAPI, uploadAPI, hospitalAPI } from '../../utils/api';
import { getSubscriptionLimits } from '../../utils/subscriptionPlans';
import toast from 'react-hot-toast';
import '../administration/SuperAdmin.css';
import './Admin.css';

const HospitalSelect = ({ hospitals, value, onChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedName = value ? (hospitals.find(h => h._id === value)?.name || 'Unknown') : 'All Hospitals';

    return (
        <div ref={dropdownRef} className="staff-hospital-select-box" style={{ position: 'relative', width: '100%' }}>
            <div 
                className="staff-input" 
                onClick={() => setIsOpen(!isOpen)} 
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', height: '100%', minHeight: '38px', padding: '8px 12px' }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedName}</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>▼</span>
            </div>
            {isOpen && (
                <div 
                    onWheel={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, 
                        background: '#fff', border: '1px solid #767676', 
                        borderRadius: '2px', marginTop: '1px', zIndex: 50,
                        maxHeight: '160px', overflowY: 'auto', boxShadow: '2px 2px 5px rgba(0,0,0,0.2)', padding: '2px 0'
                    }}
                >
                    <div 
                        onClick={() => { onChange(''); setIsOpen(false); }}
                        style={{ padding: '4px 8px', cursor: 'default', background: value === '' ? '#1a73e8' : 'transparent', color: value === '' ? '#fff' : '#000', fontSize: '14px' }}
                        onMouseEnter={(e) => { e.target.style.background = '#1a73e8'; e.target.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.target.style.background = value === '' ? '#1a73e8' : 'transparent'; e.target.style.color = value === '' ? '#fff' : '#000'; }}
                    >
                        All Hospitals
                    </div>
                    {[...hospitals].sort((a, b) => (a.name || '').trim().toLowerCase().localeCompare((b.name || '').trim().toLowerCase())).map(opt => (
                        <div key={opt._id} 
                            onClick={() => { onChange(opt._id); setIsOpen(false); }}
                            style={{
                                padding: '4px 8px', cursor: 'default',
                                background: opt._id === value ? '#1a73e8' : 'transparent',
                                color: opt._id === value ? '#fff' : '#000',
                                fontSize: '14px'
                            }}
                            onMouseEnter={(e) => { e.target.style.background = '#1a73e8'; e.target.style.color = '#fff'; }}
                            onMouseLeave={(e) => { e.target.style.background = opt._id === value ? '#1a73e8' : 'transparent'; e.target.style.color = opt._id === value ? '#fff' : '#000'; }}
                        >
                            {opt.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const Admin = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [roles, setRoles] = useState([]);
    const [hospital, setHospital] = useState(null);

    // Infinite Scroll State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);
    const observerRef = useRef(null);

    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        id: '', name: '', email: '', phone: '', roleId: '', currentAvatar: '', newAvatarFile: null, specialty: '', department: ''
    });
    const [updating, setUpdating] = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

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

    // Search state
    const [staffSearchQuery, setStaffSearchQuery] = useState('');
    const [staffSearchExpanded, setStaffSearchExpanded] = useState(false);
    const searchTimeoutRef = useRef(null);
    const staffSearchInputRef = useRef(null);

    const getPlanBadge = (userItem) => {
        let rawPlan = userItem?.subscriptionPlan || userItem?.plan;
        if (!rawPlan && userItem?.hospitalId) {
            const hId = typeof userItem.hospitalId === 'object' ? (userItem.hospitalId._id || userItem.hospitalId.id) : String(userItem.hospitalId);
            const hosp = hospitals.find(h => String(h._id) === String(hId));
            if (hosp) {
                rawPlan = hosp.subscriptionPlan || (hosp.clinicType === 'clinic' ? 'starter' : 'enterprise');
            }
        }
        if (!rawPlan && hospital) {
            rawPlan = hospital.subscriptionPlan || (hospital.clinicType === 'clinic' ? 'starter' : 'enterprise');
        }
        if (!rawPlan) return { label: 'Starter Clinic', key: 'starter' };

        const p = String(rawPlan).toLowerCase();
        if (p === 'starter' || p === 'simple_clinic') return { label: 'Starter Clinic', key: 'starter' };
        if (p === 'clinic_basic') return { label: 'Clinic Basic', key: 'clinic_basic' };
        if (p === 'multi_speciality_starter') return { label: 'Multi-Speciality', key: 'multi_speciality' };
        if (p === 'enterprise') return { label: 'Enterprise', key: 'enterprise' };
        if (p === 'none') return { label: 'Starter Clinic', key: 'starter' };
        return { label: p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), key: p };
    };

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

    const fetchUsers = async (
        plan = staffPlanFilter, 
        hospitalId = staffHospitalFilter, 
        targetPage = 1, 
        limit = 15, 
        search = staffSearchQuery,
        isAppend = false
    ) => {
        try {
            if (isAppend) {
                setLoadingMore(true);
            } else {
                setLoadingUsers(true);
            }
            const response = await adminAPI.getUsers(plan, hospitalId, targetPage, limit, search);
            if (response.success) {
                const userObj = JSON.parse(localStorage.getItem('user') || '{}');
                const isCentral = ['superadmin', 'centraladmin'].includes(userObj.role);
                const staffUsers = (response.users || response.data || []).filter(u => {
                    const r = (typeof u.role === 'string' ? u.role : (u.role?.name || '')).toLowerCase();
                    if (['patient', 'user'].includes(r)) return false;
                    if (!isCentral && r.includes('doctor')) return false;
                    return true;
                });

                if (isAppend) {
                    setUsers(prev => {
                        const existingIds = new Set(prev.map(item => item.id || item._id));
                        const uniqueNew = staffUsers.filter(item => !existingIds.has(item.id || item._id));
                        return [...prev, ...uniqueNew];
                    });
                } else {
                    setUsers(staffUsers);
                }

                if (response.pagination) {
                    setPage(response.pagination.currentPage);
                    setTotalRecords(response.pagination.totalRecords);
                    setHasMore(response.pagination.currentPage < response.pagination.totalPages);
                } else {
                    setTotalRecords(staffUsers.length);
                    setHasMore(false);
                }
            }
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Error fetching users');
        } finally {
            setLoadingUsers(false);
            setLoadingMore(false);
        }
    };

    // Infinite Scroll IntersectionObserver trigger
    useEffect(() => {
        if (loadingUsers || loadingMore || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loadingUsers) {
                    const nextPage = page + 1;
                    fetchUsers(staffPlanFilter, staffHospitalFilter, nextPage, 15, staffSearchQuery, true);
                }
            },
            { threshold: 0.1, rootMargin: '120px' }
        );

        if (observerRef.current) {
            observer.observe(observerRef.current);
        }

        return () => {
            if (observerRef.current) {
                observer.unobserve(observerRef.current);
            }
            observer.disconnect();
        };
    }, [hasMore, loadingMore, loadingUsers, page, staffPlanFilter, staffHospitalFilter, staffSearchQuery]);

    // Debounced Search Handler
    const handleSearchChange = (e) => {
        const query = e.target.value;
        setStaffSearchQuery(query);
        setPage(1);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            fetchUsers(staffPlanFilter, staffHospitalFilter, 1, 15, query, false);
        }, 300);
    };

    const handleClearSearch = () => {
        setStaffSearchQuery('');
        setPage(1);
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }
        fetchUsers(staffPlanFilter, staffHospitalFilter, 1, 15, '', false);
    };

    const handlePlanFilterChange = (e) => {
        const newPlan = e.target.value;
        setStaffPlanFilter(newPlan);
        setStaffHospitalFilter('');
        setPage(1);
        fetchUsers(newPlan, '', 1, 15, staffSearchQuery, false);
        fetchHospitals(newPlan);
    };

    const handleHospitalFilterChange = (newHosp) => {
        setStaffHospitalFilter(newHosp);
        setPage(1);
        fetchUsers(staffPlanFilter, newHosp, 1, 15, staffSearchQuery, false);
    };

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

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
                fetchUsers(staffPlanFilter, staffHospitalFilter, currentPage, pageSize, staffSearchQuery);
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error updating user.');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        toast.dismiss();
        setDeletingId(userId);
        try {
            const response = await adminAPI.deleteUser(userId);
            if (response.status === 200 || response.success === true) {
                toast.success('User deleted successfully!');
                const targetPage = (users.length === 1 && currentPage > 1) ? currentPage - 1 : currentPage;
                setCurrentPage(targetPage);
                fetchUsers(staffPlanFilter, staffHospitalFilter, targetPage, pageSize, staffSearchQuery);
            } else {
                toast.error('Failed to delete user.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error deleting user.');
        } finally {
            setDeletingId(null);
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
                setPage(1);
                fetchUsers(staffPlanFilter, staffHospitalFilter, 1, 15, staffSearchQuery, false);
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
        <div className="superadmin-page staff-management-page">
            <div className="superadmin-container">
                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {/* ANIMATED TOP CARD: Create Staff Account */}
                <div className="staff-create-card">
                    <div className="staff-create-header">
                        <div className="staff-create-title-wrap">
                            <div className="staff-create-icon-badge">
                                👥
                            </div>
                            <div>
                                <h2>Create Staff Account</h2>
                            </div>
                            {hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter') && (() => {
                                const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                                const maxStaff = limits.maxStaff;
                                const staffCount = users.filter(u => {
                                    const rName = (u.role?.name || u.role || '').toLowerCase();
                                    return !rName.includes('doctor') && !['patient', 'hospitaladmin', 'centraladmin', 'superadmin'].includes(rName);
                                }).length;
                                const remaining = Math.max(0, maxStaff - staffCount);

                                if (remaining === 0) return null;

                                return (
                                    <span className="staff-quota-pill">
                                        <span className="staff-quota-dot" />
                                        {remaining} left
                                    </span>
                                );
                            })()}
                        </div>

                        {(() => {
                            let isStaffQuotaFull = false;
                            if (hospital && (hospital.subscriptionPlan === 'clinic_basic' || hospital.subscriptionPlan === 'multi_speciality_starter')) {
                                const limits = getSubscriptionLimits(hospital.subscriptionPlan);
                                const maxStaff = limits.maxStaff;
                                const staffCount = users.filter(u => {
                                    const rName = (u.role?.name || u.role || '').toLowerCase();
                                    return !rName.includes('doctor') && !['patient', 'hospitaladmin', 'centraladmin', 'superadmin'].includes(rName);
                                }).length;
                                isStaffQuotaFull = Math.max(0, maxStaff - staffCount) === 0;
                            }
                            
                            if (isStaffQuotaFull) return null;
                            
                            return (
                                <button 
                                    onClick={handleToggleCreateForm} 
                                    className={`btn-add-staff-animated ${showCreateForm ? 'close-mode' : ''}`}
                                    title={showCreateForm ? "Close Form" : "Add Staff"}
                                >
                                    <span className="staff-btn-label-desktop">
                                        {showCreateForm ? '✕ Close Form' : '+ Add Staff'}
                                    </span>
                                    <span className="staff-btn-label-mobile">
                                        {showCreateForm ? '✕' : '+ Add Staff'}
                                    </span>
                                </button>
                            );
                        })()}
                    </div>

                    {showCreateForm && (
                        <div className="staff-form-expandable">
                            {hospital?.clinicType === 'clinic' && clinicDoctorExists && (
                                <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fecaca', fontSize: '14px' }}>
                                    ⚠️ This clinic already has an assigned Clinic Doctor. Only 1 Doctor account is permitted under this plan.
                                </div>
                            )}
                            <form onSubmit={handleCreateStaff} className="user-form">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Full Name *</label>
                                        <input type="text" placeholder="e.g. Dr. Sharma" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required minLength={2} className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Email Address *</label>
                                        <input type="email" placeholder="staff@hospital.com" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required className="staff-input" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Password *</label>
                                        <input type="text" placeholder="Temporary password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required className="staff-input" />
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
                                            required
                                            title="Phone number must be exactly 10 digits"
                                            className="staff-input" 
                                            maxLength="10" 
                                            pattern="\d{10}" 
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Profile Image</label>
                                        <input type="file" accept="image/*" onChange={e => setCreateForm({ ...createForm, file: e.target.files[0] })} className="staff-input" style={{ padding: '10px' }} />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Assign Role *</label>
                                        <select value={createForm.roleId} onChange={e => setCreateForm({ ...createForm, roleId: e.target.value })} required className="staff-input">
                                            <option value="">-- Select a Role --</option>
                                            {roles
                                                .filter(r => {
                                                    const name = (r.name || '').toLowerCase().trim();
                                                    if (['patient', 'user'].includes(name)) return false;
                                                    if (name.includes('doctor') || name.includes('doc')) return false;
                                                    if (name.includes('admin')) return false;
                                                    const isClinic = hospital?.clinicType === 'clinic';
                                                    if (!isClinic && name.includes('clinic')) return false;
                                                    return true;
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
                                                value={createForm.department}
                                                onChange={(e) => setCreateForm(prev => ({ ...prev, department: e.target.value }))}
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
                                
                                <div className="form-group" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                    <button type="button" onClick={() => setShowCreateForm(false)} className="btn-cancel" style={{ padding: '10px 20px', fontSize: '14px' }}>Cancel</button>
                                    <button type="submit" disabled={creating} className="primary-btn" style={{ background: 'linear-gradient(135deg, #0d9488, #2563eb)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600 }}>
                                        {creating ? 'Creating...' : 'Create Staff Account'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>

                {/* Quota Card if applicable */}
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
                            <div className="staff-create-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '20px 24px' }}>
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
                                {remaining === 0 && (
                                    <div style={{ color: '#dc2626', fontSize: '13px', fontWeight: 600, marginTop: '16px', background: '#fee2e2', padding: '12px 16px', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        ⚠️ Staff quota has been fully utilized. Upgrade your plan to add more staff.
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return null;
                })()}

                {/* ALL STAFF SECTION (With 5 Rainbow Themes & Infinite Scroll) */}
                <div className="staff-main-card">
                    <div className="staff-main-header">
                        <div className="staff-title-and-search-row">
                            <h2 className="staff-title-text">
                                All Staff <span className="staff-count-badge">{totalRecords}</span>
                            </h2>
                            
                            {/* Expandable Search in same row as All Staff */}
                            <div className={`staff-expandable-search-box ${staffSearchExpanded || staffSearchQuery ? 'is-expanded' : ''}`}>
                                <button 
                                    type="button"
                                    className="staff-search-icon-btn"
                                    onClick={() => {
                                        setStaffSearchExpanded(prev => {
                                            const next = !prev;
                                            if (next) {
                                                setTimeout(() => staffSearchInputRef.current?.focus(), 150);
                                            }
                                            return next;
                                        });
                                    }}
                                    title="Search staff"
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"/>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                    </svg>
                                </button>
                                <input
                                    ref={staffSearchInputRef}
                                    type="text"
                                    placeholder="Search name, email, phone..."
                                    value={staffSearchQuery}
                                    onChange={handleSearchChange}
                                    className="staff-search-expandable-input"
                                />
                                {staffSearchQuery ? (
                                    <button
                                        type="button"
                                        onClick={handleClearSearch}
                                        className="staff-search-clear-btn"
                                        title="Clear search"
                                    >
                                        ✕
                                    </button>
                                ) : staffSearchExpanded ? (
                                    <button
                                        type="button"
                                        onClick={() => setStaffSearchExpanded(false)}
                                        className="staff-search-clear-btn"
                                        title="Close search"
                                    >
                                        ✕
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {/* Dual Filters in ONE SINGLE LINE on mobile */}
                        {['superadmin', 'centraladmin'].includes(JSON.parse(localStorage.getItem('user') || '{}').role) && (
                            <div className="staff-filters-dual-row">
                                <select className="staff-input staff-filter-plan-select" value={staffPlanFilter} onChange={handlePlanFilterChange}>
                                    <option value="">All Plans</option>
                                    <option value="starter">Simple Clinics (Starter)</option>
                                    <option value="clinic_basic">Clinic Basic</option>
                                    <option value="multi_speciality_starter">Multi-Speciality Starter</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                                <div className="staff-filter-hospital-wrap">
                                    <HospitalSelect 
                                        hospitals={hospitals} 
                                        value={staffHospitalFilter} 
                                        onChange={handleHospitalFilterChange} 
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="staff-table-wrapper">
                        {loadingUsers && users.length === 0 ? (
                            <div className="users-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th className="staff-col-avatar">Avatar</th>
                                            <th className="staff-col-name">Name</th>
                                            <th className="staff-col-hospital">Hospital</th>
                                            <th className="staff-col-plan">Plan Name</th>
                                            <th className="staff-col-role">Role</th>
                                            <th className="staff-col-email">Email</th>
                                            <th className="staff-col-phone">Phone</th>
                                            <th className="staff-col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[0, 1, 2, 3, 4].map((s) => (
                                            <tr key={s} className={`staff-skeleton-row staff-row-theme-${s % 5}`}>
                                                <td className="staff-col-avatar"><div className="staff-skeleton-circle"></div></td>
                                                <td className="staff-col-name"><div className="staff-skeleton-line" style={{ width: '140px' }}></div></td>
                                                <td className="staff-col-hospital"><div className="staff-skeleton-line" style={{ width: '100px' }}></div></td>
                                                <td className="staff-col-plan"><div className="staff-skeleton-line" style={{ width: '95px' }}></div></td>
                                                <td className="staff-col-role"><div className="staff-skeleton-line" style={{ width: '90px' }}></div></td>
                                                <td className="staff-col-email"><div className="staff-skeleton-line" style={{ width: '160px' }}></div></td>
                                                <td className="staff-col-phone"><div className="staff-skeleton-line" style={{ width: '100px' }}></div></td>
                                                <td className="staff-col-actions"><div className="staff-skeleton-line" style={{ width: '110px' }}></div></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="staff-empty-state">
                                <span className="staff-empty-icon">👥</span>
                                <h3>No staff found</h3>
                                <p>No staff members match your current search or filters.</p>
                                {(staffSearchQuery || staffPlanFilter || staffHospitalFilter) && (
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setStaffSearchQuery('');
                                            setStaffPlanFilter('');
                                            setStaffHospitalFilter('');
                                            setPage(1);
                                            fetchUsers('', '', 1, 15, '', false);
                                        }}
                                        className="btn-cancel"
                                        style={{ marginTop: '14px', padding: '8px 18px', fontSize: '13px', borderRadius: '8px' }}
                                    >
                                        Clear Filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="users-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th className="staff-col-avatar">Avatar</th>
                                            <th className="staff-col-name">Name</th>
                                            <th className="staff-col-hospital">Hospital</th>
                                            <th className="staff-col-plan">Plan Name</th>
                                            <th className="staff-col-role">Role</th>
                                            <th className="staff-col-email">Email</th>
                                            <th className="staff-col-phone">Phone</th>
                                            <th className="staff-col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map((userItem, index) => {
                                            const isCurrentUser = (userItem.id || userItem._id) === JSON.parse(localStorage.getItem('user') || '{}').id;
                                            const canModify = !isCurrentUser;
                                            // 5 Rainbow Themes: 0: Green, 1: Purple, 2: Pink, 3: Blue, 4: Red
                                            const colorThemeClass = `staff-row-theme-${index % 5}`;
                                            const planInfo = getPlanBadge(userItem);

                                            return (
                                                <tr 
                                                    key={userItem.id || userItem._id} 
                                                    className={`staff-table-row ${colorThemeClass}`}
                                                    style={{ animationDelay: `${(index % 15) * 25}ms` }}
                                                >
                                                    <td className="staff-col-avatar">
                                                        {userItem.avatar ? (
                                                            <img src={userItem.avatar} alt={userItem.name} className="staff-avatar-img" />
                                                        ) : (
                                                            <div className="staff-avatar-circle-themed">
                                                                {userItem.name?.charAt(0).toUpperCase() || 'S'}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="staff-col-name">{userItem.name}</td>
                                                    <td className="staff-col-hospital">
                                                        <span className="staff-hosp-tag">
                                                            {userItem.hospitalId ? (hospitals.find(h => h._id === String(userItem.hospitalId))?.name || userItem.hospitalName || hospital?.name || 'Unknown') : '⚠️ No hospital'}
                                                        </span>
                                                    </td>
                                                    <td className="staff-col-plan">
                                                        <span className={`staff-plan-tag staff-plan-${planInfo.key}`}>
                                                            {planInfo.label}
                                                        </span>
                                                    </td>
                                                    <td className="staff-col-role">
                                                        <span className="staff-role-tag">
                                                            {(userItem.role || 'No Role').toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="staff-col-email">{userItem.email}</td>
                                                    <td className="staff-col-phone">{userItem.phone || '—'}</td>
                                                    <td className="staff-col-actions">
                                                        <div className="action-buttons">
                                                            {canModify && (
                                                                <>
                                                                    <button onClick={() => openEditModal(userItem)} className="btn-edit">Edit</button>
                                                                    <button onClick={() => setDeleteConfirm(userItem.id || userItem._id)} disabled={deletingId === (userItem.id || userItem._id)} className="btn-delete">
                                                                        {deletingId === (userItem.id || userItem._id) ? 'Deleting...' : 'Delete'}
                                                                    </button>
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

                        {/* Infinite Scroll Sentinel */}
                        <div ref={observerRef} className="staff-infinite-sentinel">
                            {loadingMore && (
                                <div className="staff-infinite-loader">
                                    <div className="staff-infinite-spinner" />
                                    <span>Loading more staff members...</span>
                                </div>
                            )}
                            {!hasMore && users.length > 0 && !loadingUsers && (
                                <span className="staff-all-loaded-text">
                                    ✨ All {totalRecords} staff records loaded
                                </span>
                            )}
                        </div>
                    </div>
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
                                <button onClick={() => handleDeleteUser(deleteConfirm)} disabled={deletingId !== null} className="btn-confirm-delete">
                                    {deletingId !== null ? 'Deleting...' : 'Delete'}
                                </button>
                                <button onClick={() => setDeleteConfirm(null)} disabled={deletingId !== null} className="btn-cancel">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Admin;