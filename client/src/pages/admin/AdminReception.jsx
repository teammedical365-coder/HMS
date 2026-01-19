import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminEntitiesAPI } from '../../utils/api';
import '../administration/Administrator.css';

const AdminReception = () => {
  const navigate = useNavigate();
  const [receptions, setReceptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingReception, setEditingReception] = useState(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    availability: {
      monday: { available: false, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
      thursday: { available: false, startTime: '09:00', endTime: '17:00' },
      friday: { available: false, startTime: '09:00', endTime: '17:00' },
      saturday: { available: false, startTime: '09:00', endTime: '17:00' },
      sunday: { available: false, startTime: '09:00', endTime: '17:00' }
    },
    description: '',
    services: []
  });

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
      navigate('/');
    }
    fetchReceptions();
  }, [navigate]);

  const fetchReceptions = async () => {
    try {
      setLoadingData(true);
      const response = await adminEntitiesAPI.getReceptions();
      if (response.success) {
        setReceptions(response.receptions);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching receptions');
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setError('');
    setSuccess('');
  };

  const handleServiceChange = (e) => {
    const services = e.target.value.split('\n').filter(s => s.trim());
    setFormData({ ...formData, services });
  };

  const handleAvailabilityChange = (day, field, value) => {
    setFormData({
      ...formData,
      availability: {
        ...formData.availability,
        [day]: {
          ...formData.availability[day],
          [field]: field === 'available' ? value : value
        }
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (editingReception) {
        const response = await adminEntitiesAPI.updateReception(editingReception._id, formData);
        if (response.success) {
          setSuccess('Reception updated successfully');
          resetForm();
          fetchReceptions();
        }
      } else {
        // Validate required fields
        if (!formData.name || !formData.email) {
          setError('Name and email are required');
          setLoading(false);
          return;
        }

        // Validate password for new receptions
        if (!formData.password || formData.password.length < 6) {
          setError('Password is required and must be at least 6 characters');
          setLoading(false);
          return;
        }

        const response = await adminEntitiesAPI.createReception(formData);
        if (response.success) {
          let successMsg = 'Reception created successfully';
          if (response.generatedPassword) {
            successMsg += `. Generated password: ${response.generatedPassword}`;
          }
          setSuccess(successMsg);
          resetForm();
          fetchReceptions();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving reception');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (reception) => {
    setEditingReception(reception);
    setFormData({
      name: reception.name,
      email: reception.email,
      phone: reception.phone || '',
      password: '', // Don't show password when editing
      availability: reception.availability || formData.availability,
      description: reception.description || '',
      services: reception.services || []
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this reception?')) {
      try {
        const response = await adminEntitiesAPI.deleteReception(id);
        if (response.success) {
          setSuccess('Reception deleted successfully');
          fetchReceptions();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error deleting reception');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      password: '',
      availability: {
        monday: { available: false, startTime: '09:00', endTime: '17:00' },
        tuesday: { available: false, startTime: '09:00', endTime: '17:00' },
        wednesday: { available: false, startTime: '09:00', endTime: '17:00' },
        thursday: { available: false, startTime: '09:00', endTime: '17:00' },
        friday: { available: false, startTime: '09:00', endTime: '17:00' },
        saturday: { available: false, startTime: '09:00', endTime: '17:00' },
        sunday: { available: false, startTime: '09:00', endTime: '17:00' }
      },
      description: '',
      services: []
    });
    setEditingReception(null);
    setShowForm(false);
  };

  return (
    <div className="administrator-page">
      <div className="administrator-container">
        <div className="admin-header">
          <div>
            <h1>Manage Reception</h1>
            <p>Add and manage reception information</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ Add Reception'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="form-card">
            <h2>{editingReception ? 'Edit Reception' : 'Add New Reception'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Reception Name *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="password">{editingReception ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={editingReception ? 'Enter new password or leave blank' : 'Enter password for login'}
                    required={!editingReception}
                    minLength={6}
                  />
                  <small className="form-hint">Minimum 6 characters. User will login with this email and password.</small>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                  placeholder="Reception description..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="services">Services (one per line)</label>
                <textarea
                  id="services"
                  name="services"
                  value={formData.services.join('\n')}
                  onChange={handleServiceChange}
                  rows="3"
                  placeholder="Appointment Booking&#10;Patient Registration&#10;Information Desk"
                />
              </div>

              <div className="form-group">
                <label>Availability</label>
                <div className="availability-grid">
                  {days.map(day => (
                    <div key={day} className="availability-day">
                      <label>
                        <input
                          type="checkbox"
                          checked={formData.availability[day].available}
                          onChange={(e) => handleAvailabilityChange(day, 'available', e.target.checked)}
                        />
                        {day.charAt(0).toUpperCase() + day.slice(1)}
                      </label>
                      {formData.availability[day].available && (
                        <div className="time-inputs">
                          <input
                            type="time"
                            value={formData.availability[day].startTime}
                            onChange={(e) => handleAvailabilityChange(day, 'startTime', e.target.value)}
                          />
                          <span>to</span>
                          <input
                            type="time"
                            value={formData.availability[day].endTime}
                            onChange={(e) => handleAvailabilityChange(day, 'endTime', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editingReception ? 'Update Reception' : 'Create Reception'}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="users-table">
          <h2>All Receptions</h2>
          {loadingData ? (
            <div className="loading-message">Loading receptions...</div>
          ) : receptions.length === 0 ? (
            <div className="empty-message">No receptions found. Create one to get started.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Services</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {receptions.map((reception) => (
                  <tr key={reception._id}>
                    <td>{reception.name}</td>
                    <td>{reception.email}</td>
                    <td>{reception.phone || '-'}</td>
                    <td>{reception.services?.length || 0} services</td>
                    <td>
                      <button onClick={() => handleEdit(reception)} className="btn-edit">Edit</button>
                      <button onClick={() => handleDelete(reception._id)} className="btn-delete">Delete</button>
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

export default AdminReception;


