import React, { useState, useEffect } from 'react';
import { medicineAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';

const AdminMedicines = () => {
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        genericName: '',
        description: '',
        category: 'General'
    });

    useEffect(() => {
        fetchMedicines();
    }, []);

    const fetchMedicines = async () => {
        try {
            setLoading(true);
            const res = await medicineAPI.getMedicines();
            if (res.success) {
                setMedicines(res.data);
            }
        } catch (err) {
            console.error('Error fetching medicines:', err);
            setError('Failed to fetch medicines.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            if (editingId) {
                const res = await medicineAPI.updateMedicine(editingId, formData);
                if (res.success) setSuccess('Medicine updated successfully!');
            } else {
                const res = await medicineAPI.createMedicine(formData);
                if (res.success) setSuccess('Medicine created successfully!');
            }
            setShowForm(false);
            setEditingId(null);
            fetchMedicines();
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving medicine.');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (medicine) => {
        setFormData({
            name: medicine.name,
            genericName: medicine.genericName || '',
            description: medicine.description || '',
            category: medicine.category || 'General'
        });
        setEditingId(medicine._id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this medicine?')) return;
        try {
            const res = await medicineAPI.deleteMedicine(id);
            if (res.success) {
                setSuccess('Medicine deleted.');
                fetchMedicines();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error deleting medicine.');
        }
    };

    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                <div className="admin-header">
                    <div>
                        <h1>Medicine Catalog</h1>
                        <p>Manage the global catalog of medicines available for doctors to prescribe</p>
                    </div>
                    <button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ name: '', genericName: '', description: '', category: 'General' }); }} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                        {showForm ? 'Cancel' : '+ Add Medicine'}
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {showForm && (
                    <div className="admin-card" style={{ marginBottom: '20px' }}>
                        <h2>{editingId ? 'Edit Medicine' : 'Add New Medicine'}</h2>
                        <form onSubmit={handleSubmit} className="user-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Medicine Name *</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="staff-input" placeholder="e.g. Paracetamol 500mg" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Generic Name</label>
                                    <input type="text" name="genericName" value={formData.genericName} onChange={handleChange} className="staff-input" placeholder="e.g. Acetaminophen" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Category</label>
                                    <input type="text" name="category" value={formData.category} onChange={handleChange} className="staff-input" placeholder="e.g. Analgesic, Antibiotic" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="staff-label">Description / Instructions</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} className="staff-input" rows="3" placeholder="e.g. Take after meals"></textarea>
                            </div>
                            <div style={{ marginTop: '20px' }}>
                                <button type="submit" disabled={loading} className="submit-button" style={{ maxWidth: '200px' }}>
                                    {loading ? 'Saving...' : 'Save Medicine'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="admin-card">
                    <h2>Available Medicines</h2>
                    {loading && !medicines.length ? (
                        <p>Loading catalog...</p>
                    ) : (
                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Generic Name</th>
                                        <th>Category</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {medicines.map(medicine => (
                                        <tr key={medicine._id}>
                                            <td style={{ fontWeight: 600 }}>{medicine.name}</td>
                                            <td>{medicine.genericName || '-'}</td>
                                            <td>{medicine.category}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button onClick={() => handleEdit(medicine)} className="btn-edit">Edit</button>
                                                    <button onClick={() => handleDelete(medicine._id)} className="btn-delete">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {medicines.length === 0 && (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No medicines defined yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminMedicines;
