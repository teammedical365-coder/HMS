import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminEntitiesAPI } from '../../utils/api';
import '../administration/Administrator.css';

const AdminServices = () => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingService, setEditingService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    description: '',
    icon: '🏥',
    color: '#14C38E',
    price: 0,
    duration: '',
    category: '',
    features: [],
    active: true
  });

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.role !== 'admin') {
      navigate('/');
    }
    fetchServices();
  }, [navigate]);

  const fetchServices = async () => {
    try {
      setLoadingData(true);
      const response = await adminEntitiesAPI.getServices();
      if (response.success) {
        setServices(response.services);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error fetching services');
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    setError('');
    setSuccess('');
  };

  const handleFeatureChange = (e) => {
    const features = e.target.value.split('\n').filter(f => f.trim());
    setFormData({ ...formData, features });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (editingService) {
        const response = await adminEntitiesAPI.updateService(editingService._id, formData);
        if (response.success) {
          setSuccess('Service updated successfully');
          resetForm();
          fetchServices();
        }
      } else {
        const response = await adminEntitiesAPI.createService(formData);
        if (response.success) {
          setSuccess('Service created successfully');
          resetForm();
          fetchServices();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error saving service');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({
      id: service.id,
      title: service.title,
      description: service.description,
      icon: service.icon || '🏥',
      color: service.color || '#14C38E',
      price: service.price || 0,
      duration: service.duration || '',
      category: service.category || '',
      features: service.features || [],
      active: service.active !== undefined ? service.active : true
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this service?')) {
      try {
        const response = await adminEntitiesAPI.deleteService(id);
        if (response.success) {
          setSuccess('Service deleted successfully');
          fetchServices();
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Error deleting service');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      id: '',
      title: '',
      description: '',
      icon: '🏥',
      color: '#14C38E',
      price: 0,
      duration: '',
      category: '',
      features: [],
      active: true
    });
    setEditingService(null);
    setShowForm(false);
  };

  return (
    <div className="administrator-page">
      <div className="administrator-container">
        <div className="admin-header">
          <div>
            <h1>Manage Services</h1>
            <p>Add and manage services that will be displayed to users</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            {showForm ? 'Cancel' : '+ Add Service'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        {showForm && (
          <div className="form-card">
            <h2>{editingService ? 'Edit Service' : 'Add New Service'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="id">Service ID *</label>
                  <input
                    type="text"
                    id="id"
                    name="id"
                    value={formData.id}
                    onChange={handleChange}
                    required
                    disabled={!!editingService}
                    placeholder="e.g., ivf, iui"
                  />
                  <small className="form-hint">Unique identifier (lowercase, no spaces)</small>
                </div>
                <div className="form-group">
                  <label htmlFor="title">Title *</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    placeholder="e.g., In Vitro Fertilization (IVF)"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description *</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                  rows="4"
                  placeholder="Service description..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="icon">Icon Emoji</label>
                  <input
                    type="text"
                    id="icon"
                    name="icon"
                    value={formData.icon}
                    onChange={handleChange}
                    placeholder="🏥"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="color">Color</label>
                  <input
                    type="color"
                    id="color"
                    name="color"
                    value={formData.color}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="price">Price</label>
                  <input
                    type="number"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="duration">Duration</label>
                  <input
                    type="text"
                    id="duration"
                    name="duration"
                    value={formData.duration}
                    onChange={handleChange}
                    placeholder="e.g., 2-3 weeks"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="category">Category</label>
                <input
                  type="text"
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g., Fertility Treatment"
                />
              </div>

              <div className="form-group">
                <label htmlFor="features">Features (one per line)</label>
                <textarea
                  id="features"
                  name="features"
                  value={formData.features.join('\n')}
                  onChange={handleFeatureChange}
                  rows="4"
                  placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="active"
                    checked={formData.active}
                    onChange={handleChange}
                  />
                  Active (visible to users)
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editingService ? 'Update Service' : 'Create Service'}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="users-table">
          <h2>All Services</h2>
          {loadingData ? (
            <div className="loading-message">Loading services...</div>
          ) : services.length === 0 ? (
            <div className="empty-message">No services found. Create one to get started.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Icon</th>
                  <th>Price</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service._id}>
                    <td>{service.id}</td>
                    <td>{service.title}</td>
                    <td>{service.icon}</td>
                    <td>${service.price || 0}</td>
                    <td>{service.active ? 'Yes' : 'No'}</td>
                    <td>
                      <button onClick={() => handleEdit(service)} className="btn-edit">Edit</button>
                      <button onClick={() => handleDelete(service._id)} className="btn-delete">Delete</button>
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

export default AdminServices;










