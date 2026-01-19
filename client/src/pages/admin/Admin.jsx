import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import ImageUploader from '../../components/ImageUploader'; // Import the new Uploader
import '../administration/Administrator.css';

const Admin = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Check if user is admin
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
      navigate('/');
    }
  }, [navigate]);

  // Fetch users on component mount
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await adminAPI.getUsers();
      if (response.success) {
        // Filter to show only doctor, lab, pharmacy, reception users
        const filteredUsers = response.users.filter(user => 
          ['doctor', 'lab', 'pharmacy', 'reception'].includes(user.role)
        );
        setUsers(filteredUsers);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Error fetching users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleEditRole = (user) => {
    setEditingUser(user);
    setError('');
    setSuccess('');
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      const response = await adminAPI.updateUserRole(userId, newRole);
      if (response.success) {
        setSuccess('User role updated successfully!');
        setEditingUser(null);
        fetchUsers();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error updating user role. Please try again.');
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
      setError(err.response?.data?.message || 'Error deleting user. Please try again.');
      setDeleteConfirm(null);
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
            <p>View and manage users (Doctors, Labs, Pharmacy, Reception)</p>
          </div>
          <div className="admin-user-info">
            <span>Welcome, {user.name}</span>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        {/* NEW: Image Upload Section */}
        <div className="admin-card" style={{ marginBottom: '20px' }}>
          <h2>Media Gallery Upload</h2>
          <p style={{ marginBottom: '15px', color: '#666' }}>
            Upload multiple images or PDFs to the CRM gallery.
          </p>
          <ImageUploader />
        </div>

        {/* Users List */}
        <div className="admin-card">
          <h2>All Users</h2>
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
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((userItem) => {
                    const isCurrentUser = userItem._id === user.id || userItem.id === user.id;
                    const isAdministrator = userItem.role === 'administrator';
                    const canModify = !isCurrentUser && !isAdministrator;

                    return (
                      <tr key={userItem._id || userItem.id}>
                        <td>{userItem.name}</td>
                        <td>{userItem.email}</td>
                        <td>
                          {editingUser && editingUser._id === userItem._id ? (
                            <select
                              value={editingUser.role}
                              onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                              className="role-select"
                            >
                              <option value="user">User</option>
                              <option value="admin">Admin</option>
                              <option value="doctor">Doctor</option>
                              <option value="lab">Lab</option>
                              <option value="pharmacy">Pharmacy</option>
                              <option value="reception">Reception</option>
                            </select>
                          ) : (
                            <span className={`role-badge role-${userItem.role}`}>
                              {userItem.role.charAt(0).toUpperCase() + userItem.role.slice(1)}
                            </span>
                          )}
                        </td>
                        <td>{userItem.phone || '-'}</td>
                        <td>{new Date(userItem.createdAt).toLocaleDateString()}</td>
                        <td>
                          <div className="action-buttons">
                            {editingUser && editingUser._id === userItem._id ? (
                              <>
                                <button
                                  onClick={() => handleUpdateRole(userItem._id || userItem.id, editingUser.role)}
                                  className="btn-save"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingUser(null)}
                                  className="btn-cancel"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                {canModify && (
                                  <>
                                    <button
                                      onClick={() => handleEditRole(userItem)}
                                      className="btn-edit"
                                    >
                                      Edit Role
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(userItem._id || userItem.id)}
                                      className="btn-delete"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                                {!canModify && <span className="no-action">-</span>}
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
              <p>Are you sure you want to delete this user? This action cannot be undone.</p>
              <div className="modal-buttons">
                <button
                  onClick={() => handleDeleteUser(deleteConfirm)}
                  className="btn-confirm-delete"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="btn-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;