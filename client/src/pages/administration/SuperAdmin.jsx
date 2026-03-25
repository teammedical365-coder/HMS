import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, uploadAPI } from '../../utils/api';
import './SuperAdmin.css';

const SuperAdmin = () => {
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [roles, setRoles] = useState([]);

    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        id: '', name: '', email: '', phone: '', roleId: '', currentAvatar: '', newAvatarFile: null, specialty: ''
    });
    const [updating, setUpdating] = useState(false);

    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Create Staff Form state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', email: '', password: '', phone: '', roleId: '', file: null
    });
    const [creating, setCreating] = useState(false);

    // Check auth
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.role !== 'superadmin' && user.role !== 'centraladmin') {
            navigate('/supremeadmin/login');
        }
    }, [navigate]);

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoadingUsers(true);
            const response = await adminAPI.getUsers();
            if (response.success) {
                setUsers(response.users);
            }
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Error fetching users.');
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const response = await adminAPI.getRoles();
            if (response.success) {
                setRoles(response.data);
            }
        } catch (err) {
            console.error('Error fetching roles:', err);
        }
    };

    // Open Edit Modal
    const openEditModal = (userItem) => {
        setEditForm({
            id: userItem.id || userItem._id,
            name: userItem.name,
            email: userItem.email,
            phone: userItem.phone || '',
            roleId: userItem.roleId || userItem.role, // Assuming roleId is available or can be derived from role name
            currentAvatar: userItem.avatar,
            newAvatarFile: null,
            specialty: userItem.specialty || ''
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
                specialty: editForm.specialty
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
            setError('Error deleting user.');
            setDeleteConfirm(null);
        }
    };

    // --- Create Staff Account ---
    const handleCreateStaff = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError('');
        setSuccess('');

        if (!createForm.name || !createForm.email || !createForm.password || !createForm.roleId) {
            setError('Name, email, password, and role are all required.');
            setCreating(false);
            return;
        }

        try {
            let avatarUrl = null;

            // 1. Upload Image if selected
            if (createForm.file) {
                const formData = new FormData();
                formData.append('images', createForm.file);

                // Use generic upload utility
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) {
                    avatarUrl = uploadRes.files[0].url;
                }
            }

            // 2. Create User with avatar URL
            const userData = {
                ...createForm,
                avatar: avatarUrl
            };

            const response = await adminAPI.createUser(userData);
            if (response.success) {
                setSuccess(`✅ ${response.user?.role || 'Staff'} account created! They can now log in with: ${createForm.email}`);
                setCreateForm({ name: '', email: '', password: '', phone: '', roleId: '', file: null });
                setShowCreateForm(false);
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error creating staff account.');
        } finally {
            setCreating(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/supremeadmin/login');
    };

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                <div className="admin-header">
                    <div>
                        <h1>SuperAdmin Dashboard</h1>
                        <p>Manage System Users & Staff Accounts</p>
                    </div>
                    <div className="admin-user-info">
                        <span>Welcome, {user.name}</span>
                        <button onClick={() => navigate('/admin/roles')} className="btn-edit" style={{ marginRight: '10px', padding: '8px 16px' }}>🔑 Manage Roles</button>
                        <button onClick={handleLogout} className="logout-btn">Logout</button>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {/* ==========================================
                    QUICK CONFIGURATIONS SECTION
                   ========================================== */}
                <div className="admin-card" style={{ marginBottom: '20px' }}>
                    <h2>⚙️ Quick Configurations</h2>
                    <p style={{ color: '#888', fontSize: '14px', margin: '5px 0 15px' }}>
                        Setup forms, catalogs, and permissions for the hospital system.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => navigate('/admin/roles')} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '4px' }}>🔑 Roles</button>
                        <button onClick={() => navigate('/admin/question-library')} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '4px', background: '#8e44ad', border: 'none' }}>❓ Questions</button>
                        <button onClick={() => navigate('/admin/lab-tests')} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '4px', background: '#e83e8c', border: 'none' }}>🧪 Lab Tests</button>
                        <button onClick={() => navigate('/admin/medicines')} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '4px', background: '#e74c3c', border: 'none' }}>💊 Medicines</button>
                        <button onClick={() => navigate('/admin/services')} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '4px', background: '#e67e22', border: 'none' }}>🛠️ Services</button>
                    </div>
                </div>

                {/* ==========================================
                    CREATE STAFF ACCOUNT SECTION
                   ========================================== */}
                <div className="admin-card" style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h2>👤 Create Staff Account</h2>
                        <button
                            onClick={() => setShowCreateForm(!showCreateForm)}
                            className={showCreateForm ? 'btn-cancel' : 'btn-save'}
                            style={{ padding: '8px 20px', fontSize: '14px' }}
                        >
                            {showCreateForm ? 'Cancel' : '+ New Staff'}
                        </button>
                    </div>

                    {!showCreateForm && (
                        <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>
                            Create login credentials for doctors, lab technicians, pharmacists, receptionists, or any custom role.
                        </p>
                    )}

                    {showCreateForm && (
                        <form onSubmit={handleCreateStaff} className="user-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Full Name *</label>
                                    <input type="text" placeholder="e.g. Dr. Sharma" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required className="staff-input" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Email Address *</label>
                                    <input type="email" placeholder="e.g. dr.sharma@hospital.com" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required className="staff-input" />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Password *</label>
                                    <input type="text" placeholder="Set a temporary password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required className="staff-input" />
                                    <small className="form-hint">Share this password with the staff member</small>
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Phone Number</label>
                                    <input type="text" placeholder="e.g. 9876543210" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} className="staff-input" />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Profile Image</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={e => setCreateForm({ ...createForm, file: e.target.files[0] })}
                                        className="staff-input"
                                        style={{ padding: '10px' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Assign Role * <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: '0.85rem', textTransform: 'none' }}>(Don't see your role? <a href="/admin/roles" style={{ color: '#0ea5e9' }}>Create one here</a>)</span></label>
                                    <select value={createForm.roleId} onChange={e => setCreateForm({ ...createForm, roleId: e.target.value })} required className="staff-input">
                                        <option value="">-- Select a Role --</option>
                                        {roles.map(role => (
                                            <option key={role._id} value={role._id}>
                                                {role.name} {role.description ? `— ${role.description}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <button type="submit" disabled={creating} className="submit-button">
                                {creating ? 'Creating Account...' : '✅ Create Staff Account'}
                            </button>
                        </form>
                    )}
                </div>

                {/* ==========================================
                    USER TABLE
                   ========================================== */}
                <div className="admin-card">
                    <h2>All Staff & Users</h2>
                    {loadingUsers ? (
                        <div className="loading-message">Loading users...</div>
                    ) : users.length === 0 ? (
                        <div className="empty-message">No users found</div>
                    ) : (
                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Avatar</th>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Role</th>
                                        <th>Phone</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((userItem) => {
                                        const isCurrentUser = (userItem.id || userItem._id) === user.id;
                                        const canModify = !isCurrentUser;

                                        return (
                                            <tr key={userItem.id || userItem._id}>
                                                <td>
                                                    {userItem.avatar ? (
                                                        <img
                                                            src={userItem.avatar}
                                                            alt={userItem.name}
                                                            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                                                        />
                                                    ) : (
                                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                                                            {userItem.name?.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>{userItem.name}</td>
                                                <td>{userItem.email}</td>
                                                <td>
                                                    <span className={`role-badge role-${(userItem.role || '').toLowerCase()}`}>
                                                        {(userItem.role || 'No Role').toUpperCase()}
                                                    </span>
                                                </td>
                                                <td>{userItem.phone || '-'}</td>
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
                                        <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Role</label>
                                        <select value={editForm.roleId} onChange={e => setEditForm({ ...editForm, roleId: e.target.value })} required className="staff-input">
                                            {roles.map(role => (
                                                <option key={role._id} value={role._id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>


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


                {deleteConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Confirm Delete</h3>
                            <p>Are you sure?</p>
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

export default SuperAdmin;