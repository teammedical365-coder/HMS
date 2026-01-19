import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminEntitiesAPI } from '../../utils/api';
import '../administration/Administrator.css';

const AdminLabs = () => {
  const navigate = useNavigate();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingLab, setEditingLab] = useState(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    services: [],
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
    facilities: []
  });

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
      navigate('/');
    }
    fetchLabs();
  }, [navigate]);

  const fetchLabs = async () => {
    try {
      setLoadingData(true);
      const response = await adminEntitiesAPI.getLabs();
      if (response.success) {
        setLabs(response.labs);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching labs');
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

  const handleFacilityChange = (e) => {
    const facilities = e.target.value.split('\n').filter(f => f.trim());
    setFormData({ ...formData, facilities });
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
      if (editingLab) {
        const response = await adminEntitiesAPI.updateLab(editingLab._id, formData);
        if (response.success) {
          setSuccess('Lab updated successfully');
          resetForm();
          fetchLabs();
        }
      } else {
        // Validate required fields
        if (!formData.name || !formData.email) {
          setError('Name and email are required');
          setLoading(false);
          return;
        }

        // Validate password for new labs
        if (!formData.password || formData.password.length < 6) {
          setError('Password is required and must be at least 6 characters');
          setLoading(false);
          return;
        }

        const response = await adminEntitiesAPI.createLab(formData);
        if (response.success) {
          let successMsg = 'Lab created successfully';
          if (response.generatedPassword) {
            successMsg += `. Generated password: ${response.generatedPassword}`;
          }
          setSuccess(successMsg);
          resetForm();
          fetchLabs();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving lab');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (lab) => {
    setEditingLab(lab);
    setFormData({
      name: lab.name,
      email: lab.email,
      phone: lab.phone || '',
      address: lab.address || '',
      password: '', // Don't show password when editing
      services: lab.services || [],
      availability: lab.availability || formData.availability,
      description: lab.description || '',
      facilities: lab.facilities || []
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this lab?')) {
      try {
        const response = await adminEntitiesAPI.deleteLab(id);
        if (response.success) {
          setSuccess('Lab deleted successfully');
          fetchLabs();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error deleting lab');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      password: '',
      services: [],
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
      facilities: []
    });
    setEditingLab(null);
    setShowForm(false);
  };

  return (
    <div className="administrator-page">
      <div className="administrator-container">
        <div className="admin-header">
          <div>
            <h1>Manage Labs</h1>
            <p>Add and manage laboratory information</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ Add Lab'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="form-card">
            <h2>{editingLab ? 'Edit Lab' : 'Add New Lab'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Lab Name *</label>
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
                  <label htmlFor="address">Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="password">{editingLab ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={editingLab ? 'Enter new password or leave blank' : 'Enter password for login'}
                    required={!editingLab}
                    minLength={6}
                  />
                  <small className="form-hint">Minimum 6 characters. User will login with this email and password.</small>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="services">Services (one per line)</label>
                <textarea
                  id="services"
                  name="services"
                  value={formData.services.join('\n')}
                  onChange={handleServiceChange}
                  rows="3"
                  placeholder="Blood Test&#10;Urine Test&#10;X-Ray"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                  placeholder="Lab description..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="facilities">Facilities (one per line)</label>
                <textarea
                  id="facilities"
                  name="facilities"
                  value={formData.facilities.join('\n')}
                  onChange={handleFacilityChange}
                  rows="3"
                  placeholder="Modern Equipment&#10;Certified Technicians&#10;Fast Results"
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
                  {loading ? 'Saving...' : editingLab ? 'Update Lab' : 'Create Lab'}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="users-table">
          <h2>All Labs</h2>
          {loadingData ? (
            <div className="loading-message">Loading labs...</div>
          ) : labs.length === 0 ? (
            <div className="empty-message">No labs found. Create one to get started.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab._id}>
                    <td>{lab.name}</td>
                    <td>{lab.email}</td>
                    <td>{lab.phone || '-'}</td>
                    <td>{lab.address || '-'}</td>
                    <td>
                      <button onClick={() => handleEdit(lab)} className="btn-edit">Edit</button>
                      <button onClick={() => handleDelete(lab._id)} className="btn-delete">Delete</button>
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

export default AdminLabs;


