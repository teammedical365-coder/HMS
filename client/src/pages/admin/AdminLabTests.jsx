import React, { useState, useEffect } from 'react';
import { labTestAPI, hospitalAPI } from '../../utils/api';
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

    // Hospital pricing
    const [hospitals, setHospitals] = useState([]);
    const [selectedHospitalFilter, setSelectedHospitalFilter] = useState('');
    const [pricingTestId, setPricingTestId] = useState(null);
    const [hospitalPriceInputs, setHospitalPriceInputs] = useState({});
    const [savingPrice, setSavingPrice] = useState(false);

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isCentralAdmin = currentUser?.role === 'centraladmin' || currentUser?.role === 'superadmin';

    useEffect(() => {
        fetchTests();
        if (isCentralAdmin) fetchHospitals();
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

    const fetchHospitals = async () => {
        try {
            const res = await hospitalAPI.getHospitals();
            if (res.success) setHospitals(res.hospitals);
        } catch (err) { console.error('Error fetching hospitals:', err); }
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

    const openPricingPanel = (test) => {
        if (pricingTestId === test._id) {
            setPricingTestId(null);
            return;
        }
        setPricingTestId(test._id);
        // Initialize inputs from existing hospitalPrices
        const prices = {};
        const hpMap = test.hospitalPrices || {};
        hospitals.forEach(h => {
            const existing = hpMap[h._id];
            prices[h._id] = existing !== undefined ? String(existing) : '';
        });
        setHospitalPriceInputs(prices);
    };

    const handleSaveHospitalPrice = async (testId, hospitalId) => {
        setSavingPrice(true);
        setError('');
        try {
            const priceVal = hospitalPriceInputs[hospitalId];
            const res = await labTestAPI.setHospitalPrice(
                testId,
                hospitalId,
                priceVal === '' ? null : Number(priceVal)
            );
            if (res.success) {
                setSuccess(`Price updated for ${hospitals.find(h => h._id === hospitalId)?.name || 'hospital'}`);
                fetchTests();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving hospital price.');
        } finally {
            setSavingPrice(false);
        }
    };

    const getHospitalPrice = (test, hospitalId) => {
        const hpMap = test.hospitalPrices || {};
        return hpMap[hospitalId];
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
                                    <label className="staff-label">Default Price (₹)</label>
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

                {/* Hospital filter for viewing prices */}
                {isCentralAdmin && hospitals.length > 0 && (
                    <div className="admin-card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#334155' }}>View prices for:</span>
                            <select
                                value={selectedHospitalFilter}
                                onChange={e => setSelectedHospitalFilter(e.target.value)}
                                style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', minWidth: '220px' }}
                            >
                                <option value="">Default (Base Price)</option>
                                {hospitals.map(h => (
                                    <option key={h._id} value={h._id}>{h.name}{h.city ? ` — ${h.city}` : ''}</option>
                                ))}
                            </select>
                            {selectedHospitalFilter && (
                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                    Showing hospital-specific prices. Click "Set Prices" on any test to edit.
                                </span>
                            )}
                        </div>
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
                                        <th>Base Price</th>
                                        {selectedHospitalFilter && <th>Hospital Price</th>}
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tests.map(test => {
                                        const hospitalPrice = selectedHospitalFilter ? getHospitalPrice(test, selectedHospitalFilter) : undefined;
                                        return (
                                            <React.Fragment key={test._id}>
                                                <tr>
                                                    <td style={{ fontWeight: 600 }}>{test.name}</td>
                                                    <td>{test.code || '-'}</td>
                                                    <td>{test.category}</td>
                                                    <td>₹{test.price}</td>
                                                    {selectedHospitalFilter && (
                                                        <td style={{ fontWeight: 600, color: hospitalPrice !== undefined ? '#059669' : '#94a3b8' }}>
                                                            {hospitalPrice !== undefined ? `₹${hospitalPrice}` : `₹${test.price} (default)`}
                                                        </td>
                                                    )}
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
                                                        <div className="action-buttons" style={{ gap: '6px' }}>
                                                            <button onClick={() => handleEdit(test)} className="btn-edit">Edit</button>
                                                            {isCentralAdmin && (
                                                                <button
                                                                    onClick={() => openPricingPanel(test)}
                                                                    className="btn-edit"
                                                                    style={{ background: pricingTestId === test._id ? '#fef3c7' : '#eff6ff', color: pricingTestId === test._id ? '#92400e' : '#2563eb', border: `1px solid ${pricingTestId === test._id ? '#fbbf24' : '#93c5fd'}` }}
                                                                >
                                                                    {pricingTestId === test._id ? 'Close' : 'Set Prices'}
                                                                </button>
                                                            )}
                                                            <button onClick={() => handleDelete(test._id)} className="btn-delete">Delete</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Hospital pricing panel */}
                                                {pricingTestId === test._id && (
                                                    <tr>
                                                        <td colSpan={selectedHospitalFilter ? 7 : 6} style={{ padding: 0 }}>
                                                            <div style={{ background: '#f8fafc', padding: '16px 20px', borderTop: '2px solid #e2e8f0' }}>
                                                                <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#334155' }}>
                                                                    Hospital-wise Pricing for "{test.name}" (Base: ₹{test.price})
                                                                </h4>
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                                                                    {hospitals.map(h => {
                                                                        const currentHospitalPrice = getHospitalPrice(test, h._id);
                                                                        return (
                                                                            <div key={h._id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                                                <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                                                                    {h.name}
                                                                                    {currentHospitalPrice !== undefined && (
                                                                                        <span style={{ color: '#059669', fontWeight: 400, marginLeft: '4px' }}>(₹{currentHospitalPrice})</span>
                                                                                    )}
                                                                                </span>
                                                                                <input
                                                                                    type="number"
                                                                                    placeholder={`₹${test.price}`}
                                                                                    value={hospitalPriceInputs[h._id] || ''}
                                                                                    onChange={e => setHospitalPriceInputs(prev => ({ ...prev, [h._id]: e.target.value }))}
                                                                                    style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                                                                                    min="0"
                                                                                />
                                                                                <button
                                                                                    onClick={() => handleSaveHospitalPrice(test._id, h._id)}
                                                                                    disabled={savingPrice}
                                                                                    style={{ padding: '4px 10px', fontSize: '12px', fontWeight: 600, background: '#059669', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                                                >
                                                                                    Save
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>
                                                                    Leave empty and save to reset to the default base price.
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                    {tests.length === 0 && (
                                        <tr>
                                            <td colSpan={selectedHospitalFilter ? 7 : 6} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>No lab tests defined yet.</td>
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
