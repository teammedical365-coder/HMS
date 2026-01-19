import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminEntitiesAPI } from '../../utils/api';
import '../administration/Administrator.css';

const AdminPharmacy = () => {
  const navigate = useNavigate();
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingPharmacy, setEditingPharmacy] = useState(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
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
    medications: []
  });

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
      navigate('/');
    }
    fetchPharmacies();
  }, [navigate]);

  const fetchPharmacies = async () => {
    try {
      setLoadingData(true);
      const response = await adminEntitiesAPI.getPharmacies();
      if (response.success) {
        setPharmacies(response.pharmacies);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching pharmacies');
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
      if (editingPharmacy) {
        const response = await adminEntitiesAPI.updatePharmacy(editingPharmacy._id, formData);
        if (response.success) {
          setSuccess('Pharmacy updated successfully');
          resetForm();
          fetchPharmacies();
        }
      } else {
        // Validate required fields
        if (!formData.name || !formData.email) {
          setError('Name and email are required');
          setLoading(false);
          return;
        }

        // Validate password for new pharmacies
        if (!formData.password || formData.password.length < 6) {
          setError('Password is required and must be at least 6 characters');
          setLoading(false);
          return;
        }

        const response = await adminEntitiesAPI.createPharmacy(formData);
        if (response.success) {
          let successMsg = 'Pharmacy created successfully';
          if (response.generatedPassword) {
            successMsg += `. Generated password: ${response.generatedPassword}`;
          }
          setSuccess(successMsg);
          resetForm();
          fetchPharmacies();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving pharmacy');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (pharmacy) => {
    setEditingPharmacy(pharmacy);
    setFormData({
      name: pharmacy.name,
      email: pharmacy.email,
      phone: pharmacy.phone || '',
      address: pharmacy.address || '',
      password: '', // Don't show password when editing
      availability: pharmacy.availability || formData.availability,
      description: pharmacy.description || '',
      medications: pharmacy.medications || []
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this pharmacy?')) {
      try {
        const response = await adminEntitiesAPI.deletePharmacy(id);
        if (response.success) {
          setSuccess('Pharmacy deleted successfully');
          fetchPharmacies();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error deleting pharmacy');
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
      medications: []
    });
    setEditingPharmacy(null);
    setShowForm(false);
  };

  return (
    <div className="administrator-page">
      <div className="administrator-container">
        <div className="admin-header">
          <div>
            <h1>Manage Pharmacy</h1>
            <p>Add and manage pharmacy information</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ Add Pharmacy'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="form-card">
            <h2>{editingPharmacy ? 'Edit Pharmacy' : 'Add New Pharmacy'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Pharmacy Name *</label>
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
                  <label htmlFor="password">{editingPharmacy ? 'New Password (leave blank to keep current)' : 'Password *'}</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={editingPharmacy ? 'Enter new password or leave blank' : 'Enter password for login'}
                    required={!editingPharmacy}
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
                  placeholder="Pharmacy description..."
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
                  {loading ? 'Saving...' : editingPharmacy ? 'Update Pharmacy' : 'Create Pharmacy'}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="users-table">
          <h2>All Pharmacies</h2>
          {loadingData ? (
            <div className="loading-message">Loading pharmacies...</div>
          ) : pharmacies.length === 0 ? (
            <div className="empty-message">No pharmacies found. Create one to get started.</div>
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
                {pharmacies.map((pharmacy) => (
                  <tr key={pharmacy._id}>
                    <td>{pharmacy.name}</td>
                    <td>{pharmacy.email}</td>
                    <td>{pharmacy.phone || '-'}</td>
                    <td>{pharmacy.address || '-'}</td>
                    <td>
                      <button onClick={() => handleEdit(pharmacy)} className="btn-edit">Edit</button>
                      <button onClick={() => handleDelete(pharmacy._id)} className="btn-delete">Delete</button>
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

export default AdminPharmacy;


