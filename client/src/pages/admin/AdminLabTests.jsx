import React, { useState, useEffect } from 'react';
import { labTestAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';

const AdminLabTests = () => {
    const [tests, setTests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        price: '',
        category: 'General',
        isActive: true
    });

    useEffect(() => {
        fetchTests();
    }, []);

    const fetchTests = async () => {
        try {
            setLoading(true);
            const res = await labTestAPI.getLabTests();
            if (res.success) {
                setTests(res.data);
            }
        } catch (err) {
            console.error('Error fetching lab tests:', err);
            setError('Failed to fetch lab tests.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
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
            const dataToSubmit = {
                ...formData,
                price: Number(formData.price) || 0
            };

            if (editingId) {
                const res = await labTestAPI.updateLabTest(editingId, dataToSubmit);
                if (res.success) setSuccess('Lab test updated successfully!');
            } else {
                const res = await labTestAPI.createLabTest(dataToSubmit);
                if (res.success) setSuccess('Lab test created successfully!');
            }
            setShowForm(false);
            setEditingId(null);
            fetchTests();
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving lab test.');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (test) => {
        setFormData({
            name: test.name,
            code: test.code || '',
            description: test.description || '',
            price: test.price || '',
            category: test.category || 'General',
            isActive: test.isActive
        });
        setEditingId(test._id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this lab test?')) return;
        try {
            const res = await labTestAPI.deleteLabTest(id);
            if (res.success) {
                setSuccess('Lab test deleted.');
                fetchTests();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error deleting test.');
        }
    };

    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                <div className="admin-header">
                    <div>
                        <h1>Lab Tests Catalog</h1>
                        <p>Manage the predefined lab tests available for doctors and labs</p>
                    </div>
                    <button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ name: '', code: '', description: '', price: '', category: 'General', isActive: true }); }} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                        {showForm ? 'Cancel' : '+ Add Lab Test'}
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {showForm && (
                    <div className="admin-card" style={{ marginBottom: '20px' }}>
                        <h2>{editingId ? 'Edit Lab Test' : 'Add New Lab Test'}</h2>
                        <form onSubmit={handleSubmit} className="user-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Test Name *</label>
                                    <input type="text" name="name" value={formData.name} onChange={handleChange} required className="staff-input" placeholder="e.g. Complete Blood Count" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Test Code</label>
                                    <input type="text" name="code" value={formData.code} onChange={handleChange} className="staff-input" placeholder="e.g. CBC" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Category</label>
                                    <input type="text" name="category" value={formData.category} onChange={handleChange} className="staff-input" placeholder="e.g. Hematology" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Price (₹)</label>
                                    <input type="number" name="price" value={formData.price} onChange={handleChange} className="staff-input" placeholder="e.g. 500" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="staff-label">Description / Guidelines</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} className="staff-input" rows="3" placeholder="e.g. Fasting required for 12 hours"></textarea>
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                                <input type="checkbox" id="isActive" name="isActive" checked={formData.isActive} onChange={handleChange} style={{ width: '18px', height: '18px' }} />
                                <label htmlFor="isActive" style={{ fontWeight: 600, color: '#334155' }}>Active (Visible to Doctors)</label>
                            </div>
                            <div style={{ marginTop: '20px' }}>
                                <button type="submit" disabled={loading} className="submit-button" style={{ maxWidth: '200px' }}>
                                    {loading ? 'Saving...' : 'Save Lab Test'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="admin-card">
                    <h2>Available Lab Tests</h2>
                    {loading && !tests.length ? (
                        <p>Loading catalog...</p>
                    ) : (
                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Code</th>
                                        <th>Category</th>
                                        <th>Price</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tests.map(test => (
                                        <tr key={test._id}>
                                            <td style={{ fontWeight: 600 }}>{test.name}</td>
                                            <td>{test.code || '-'}</td>
                                            <td>{test.category}</td>
                                            <td>₹{test.price}</td>
                                            <td>
                                                <span style={{
                                                    padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                                                    backgroundColor: test.isActive ? '#dcfce7' : '#f1f5f9',
                                                    color: test.isActive ? '#166534' : '#64748b'
                                                }}>
                                                    {test.isActive ? 'Active' : 'Hidden'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button onClick={() => handleEdit(test)} className="btn-edit">Edit</button>
                                                    <button onClick={() => handleDelete(test._id)} className="btn-delete">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {tests.length === 0 && (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No lab tests defined yet.</td>
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

export default AdminLabTests;
