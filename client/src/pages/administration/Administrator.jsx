import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../utils/api';
import './Administrator.css';

const Administrator = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'doctor',
    services: []
  });
  
  // Available services from Services page
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Check if user is administrator
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'administrator') {
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
        setUsers(response.users);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
      // Reset services when role changes from doctor
      ...(name === 'role' && value !== 'doctor' ? { services: [] } : {})
    });
    setError('');
    setSuccess('');
  };

  const handleServiceChange = (e) => {
    const selectedServices = Array.from(e.target.selectedOptions, option => option.value);
    setFormData({
      ...formData,
      services: selectedServices
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validation
    if (!formData.name || !formData.email || !formData.password || !formData.role) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    // Validate services for doctor role
    if (formData.role === 'doctor' && formData.services.length === 0) {
      setError('Please select at least one service for doctor');
      setLoading(false);
      return;
    }

    try {
      const response = await adminAPI.createUser(
        formData.name,
        formData.email,
        formData.password,
        formData.phone,
        formData.role,
        formData.services
      );

      if (response.success) {
        setSuccess(`${formData.role.charAt(0).toUpperCase() + formData.role.slice(1)} user created successfully!`);
        // Reset form
        setFormData({
          name: '',
          email: '',
          password: '',
          phone: '',
          role: 'doctor',
          services: []
        });
        // Refresh users list
        fetchUsers();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error creating user. Please try again.');
    } finally {
      setLoading(false);
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
            <h1>Administrator Dashboard</h1>
            <p>Manage users and system settings</p>
          </div>
          <div className="admin-user-info">
            <span>Welcome, {user.name}</span>
            <button onClick={handleLogout} className="logout-btn">
              Logout
            </button>
          </div>
        </div>

        {/* Create User Form */}
        <div className="admin-card">
          <h2>Create New User</h2>
          
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

          <form onSubmit={handleSubmit} className="user-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Full Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter password (min 6 characters)"
                  required
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="Enter phone number (optional)"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="role">Role *</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                required
              >
                <option value="doctor">Doctor</option>
                <option value="lab">Lab</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="reception">Reception</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {formData.role === 'doctor' && (
              <div className="form-group">
                <label htmlFor="services">Services *</label>
                <select
                  id="services"
                  name="services"
                  multiple
                  value={formData.services}
                  onChange={handleServiceChange}
                  required
                  className="services-multiselect"
                  size={5}
                >
                  {availableServices.map(service => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                <small className="form-hint">Hold Ctrl (Windows) or Cmd (Mac) to select multiple services</small>
              </div>
            )}

            <button 
              type="submit" 
              className="submit-button"
              disabled={loading}
            >
              {loading ? 'Creating User...' : 'Create User'}
            </button>
          </form>
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
                    const canModify = !isCurrentUser;

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
                              <option value="administrator">Administrator</option>
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

export default Administrator;

