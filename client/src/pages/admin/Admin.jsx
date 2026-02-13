import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import ImageUploader from '../../components/ImageUploader';
import '../administration/Administrator.css';

const Admin = () => {
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [roles, setRoles] = useState([]);

    const [editingUser, setEditingUser] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Create Staff Form state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', email: '', password: '', phone: '', roleId: ''
    });
    const [creating, setCreating] = useState(false);

    // Check if user is admin
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const perms = user.permissions || [];
        if (user.role !== 'admin' && user.role !== 'administrator' &&
            !perms.includes('*') && !perms.includes('admin_manage_roles') && !perms.includes('admin_view_stats')) {
            navigate('/');
        }
    }, [navigate]);

    useEffect(() => {
        fetchUsers();
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        try {
            const response = await adminAPI.getRoles();
            if (response.success) setRoles(response.data);
        } catch (err) {
            console.error('Error fetching roles:', err);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoadingUsers(true);
            const response = await adminAPI.getUsers();
            if (response.success) setUsers(response.users);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Error fetching users');
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleEditRole = (user) => {
        setEditingUser({ ...user, tempRoleId: user.roleId || '' });
        setError('');
        setSuccess('');
    };

    const handleUpdateRole = async (userId, selectedRoleId) => {
        try {
            const response = await adminAPI.updateUserRole(userId, selectedRoleId);
            if (response.success) {
                setSuccess('User role updated successfully!');
                setEditingUser(null);
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error updating user role.');
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

        if (!createForm.name || !createForm.email || !createForm.password || !createForm.roleId) {
            setError('Name, email, password, and role are all required.');
            setCreating(false);
            return;
        }

        try {
            const response = await adminAPI.createUser(createForm);
            if (response.success) {
                setSuccess(`✅ ${response.user?.role || 'Staff'} account created! They can log in with: ${createForm.email}`);
                setCreateForm({ name: '', email: '', password: '', phone: '', roleId: '' });
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
        navigate('/');
    };

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    return (
        <div className="administrator-page">
            <div className="administrator-container">
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

                {/* CREATE STAFF ACCOUNT SECTION */}
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
                            Create login credentials for doctors, lab technicians, pharmacists, or any custom role.
                        </p>
                    )}

                    {showCreateForm && (
                        <form onSubmit={handleCreateStaff} style={{ display: 'grid', gap: '14px' }}>
                            <style>{`
                                .staff-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #444; background: #1a1a2e; color: #fff; font-size: 14px; box-sizing: border-box; }
                                .staff-input::placeholder { color: #666; }
                                .staff-input:focus { border-color: #6c63ff; outline: none; }
                                .staff-label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px; color: #ccc; }
                            `}</style>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label className="staff-label">Full Name *</label>
                                    <input type="text" placeholder="e.g. Dr. Sharma" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required className="staff-input" />
                                </div>
                                <div>
                                    <label className="staff-label">Email Address *</label>
                                    <input type="email" placeholder="e.g. dr.sharma@hospital.com" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required className="staff-input" />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                    <label className="staff-label">Password *</label>
                                    <input type="text" placeholder="Set a temporary password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required className="staff-input" />
                                    <small style={{ color: '#888', fontSize: '11px' }}>Share this password with the staff member</small>
                                </div>
                                <div>
                                    <label className="staff-label">Phone Number</label>
                                    <input type="text" placeholder="e.g. 9876543210" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} className="staff-input" />
                                </div>
                            </div>

                            <div>
                                <label className="staff-label">Assign Role * <span style={{ fontWeight: 400, color: '#888', fontSize: '11px' }}>(Don't see your role? <a href="/admin/roles" style={{ color: '#6c63ff' }}>Create one here</a>)</span></label>
                                <select value={createForm.roleId} onChange={e => setCreateForm({ ...createForm, roleId: e.target.value })} required className="staff-input">
                                    <option value="">-- Select a Role --</option>
                                    {roles.map(role => (
                                        <option key={role._id} value={role._id}>
                                            {role.name} {role.description ? `— ${role.description}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button type="submit" disabled={creating} className="btn-save" style={{ padding: '12px 24px', fontSize: '15px', fontWeight: '600', marginTop: '4px' }}>
                                {creating ? 'Creating Account...' : '✅ Create Staff Account'}
                            </button>
                        </form>
                    )}
                </div>

                {/* Media Uploader */}
                <div className="admin-card" style={{ marginBottom: '20px' }}>
                    <h2>Media Gallery Upload</h2>
                    <ImageUploader />
                </div>

                {/* Users List */}
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
                                                <td>{userItem.name}</td>
                                                <td>{userItem.email}</td>
                                                <td>
                                                    {editingUser && (editingUser.id || editingUser._id) === (userItem.id || userItem._id) ? (
                                                        <select
                                                            value={editingUser.tempRoleId}
                                                            onChange={(e) => setEditingUser({ ...editingUser, tempRoleId: e.target.value })}
                                                            className="role-select"
                                                        >
                                                            <option value="">-- Select Role --</option>
                                                            {roles.map((role) => (
                                                                <option key={role._id} value={role._id}>
                                                                    {role.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className={`role-badge role-${(userItem.role || '').toLowerCase()}`}>
                                                            {(userItem.role || 'No Role').toUpperCase()}
                                                        </span>
                                                    )}
                                                </td>
                                                <td>{userItem.phone || '-'}</td>
                                                <td>
                                                    <div className="action-buttons">
                                                        {editingUser && (editingUser.id || editingUser._id) === (userItem.id || userItem._id) ? (
                                                            <>
                                                                <button onClick={() => handleUpdateRole(userItem.id || userItem._id, editingUser.tempRoleId)} className="btn-save">Save</button>
                                                                <button onClick={() => setEditingUser(null)} className="btn-cancel">Cancel</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {canModify && (
                                                                    <>
                                                                        <button onClick={() => handleEditRole(userItem)} className="btn-edit">Edit Role</button>
                                                                        <button onClick={() => setDeleteConfirm(userItem.id || userItem._id)} className="btn-delete">Delete</button>
                                                                    </>
                                                                )}
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