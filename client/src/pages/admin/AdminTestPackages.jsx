import React, { useState, useEffect, useMemo } from 'react';
import { labTestAPI, testPackageAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';
import './AdminTestPackages.css';

const AdminTestPackages = () => {
    // === STATE ===
    const [activeTab, setActiveTab] = useState('packages'); // 'packages' | 'tests'
    const [tests, setTests] = useState([]);
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    // Package Form
    const [showPackageForm, setShowPackageForm] = useState(false);
    const [editingPackageId, setEditingPackageId] = useState(null);
    const [packageForm, setPackageForm] = useState({
        name: '', code: '', description: '', tests: [],
        price: '', discountedPrice: '', category: 'General', isActive: true
    });

    // Test Form
    const [showTestForm, setShowTestForm] = useState(false);
    const [editingTestId, setEditingTestId] = useState(null);
    const [testForm, setTestForm] = useState({
        name: '', code: '', description: '', price: '', category: 'General', isActive: true
    });

    // === FETCH DATA ===
    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [testsRes, packagesRes] = await Promise.all([
                labTestAPI.getLabTests(),
                testPackageAPI.getPackages()
            ]);
            if (testsRes.success) setTests(testsRes.data);
            if (packagesRes.success) setPackages(packagesRes.data);
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Failed to load data.');
        } finally {
            setLoading(false);
        }
    };

    // Auto-dismiss messages
    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => { setSuccess(''); setError(''); }, 4000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);

    // === DERIVED DATA ===
    const categories = useMemo(() => {
        const cats = new Set();
        tests.forEach(t => cats.add(t.category || 'General'));
        packages.forEach(p => cats.add(p.category || 'General'));
        return Array.from(cats).sort();
    }, [tests, packages]);

    const filteredTests = useMemo(() => {
        return tests.filter(t => {
            const matchesSearch = !searchTerm ||
                t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.code || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCat = !categoryFilter || t.category === categoryFilter;
            return matchesSearch && matchesCat;
        });
    }, [tests, searchTerm, categoryFilter]);

    const filteredPackages = useMemo(() => {
        return packages.filter(p => {
            const matchesSearch = !searchTerm ||
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.code || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCat = !categoryFilter || p.category === categoryFilter;
            return matchesSearch && matchesCat;
        });
    }, [packages, searchTerm, categoryFilter]);

    const totalTestPrice = useMemo(() => {
        return packageForm.tests.reduce((sum, testId) => {
            const test = tests.find(t => t._id === testId);
            return sum + (test?.price || 0);
        }, 0);
    }, [packageForm.tests, tests]);

    // === PACKAGE HANDLERS ===
    const resetPackageForm = () => {
        setPackageForm({
            name: '', code: '', description: '', tests: [],
            price: '', discountedPrice: '', category: 'General', isActive: true
        });
        setEditingPackageId(null);
    };

    const handlePackageChange = (e) => {
        const { name, value, type, checked } = e.target;
        setPackageForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setError('');
    };

    const toggleTestInPackage = (testId) => {
        setPackageForm(prev => ({
            ...prev,
            tests: prev.tests.includes(testId)
                ? prev.tests.filter(id => id !== testId)
                : [...prev.tests, testId]
        }));
    };

    const handlePackageSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const data = {
                ...packageForm,
                price: Number(packageForm.price) || 0,
                discountedPrice: Number(packageForm.discountedPrice) || 0
            };

            if (editingPackageId) {
                const res = await testPackageAPI.updatePackage(editingPackageId, data);
                if (res.success) setSuccess('✅ Package updated successfully!');
            } else {
                const res = await testPackageAPI.createPackage(data);
                if (res.success) setSuccess('✅ Package created successfully!');
            }

            setShowPackageForm(false);
            resetPackageForm();
            fetchAll();
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving package.');
        } finally {
            setLoading(false);
        }
    };

    const handleEditPackage = (pkg) => {
        setPackageForm({
            name: pkg.name,
            code: pkg.code || '',
            description: pkg.description || '',
            tests: pkg.tests?.map(t => t._id || t) || [],
            price: pkg.price || '',
            discountedPrice: pkg.discountedPrice || '',
            category: pkg.category || 'General',
            isActive: pkg.isActive
        });
        setEditingPackageId(pkg._id);
        setShowPackageForm(true);
        setActiveTab('packages');
    };

    const handleDeletePackage = async (id) => {
        if (!window.confirm('Are you sure you want to delete this package?')) return;
        try {
            const res = await testPackageAPI.deletePackage(id);
            if (res.success) {
                setSuccess('Package deleted.');
                fetchAll();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error deleting package.');
        }
    };

    // === TEST HANDLERS ===
    const resetTestForm = () => {
        setTestForm({ name: '', code: '', description: '', price: '', category: 'General', isActive: true });
        setEditingTestId(null);
    };

    const handleTestChange = (e) => {
        const { name, value, type, checked } = e.target;
        setTestForm(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setError('');
    };

    const handleTestSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const data = { ...testForm, price: Number(testForm.price) || 0 };

            if (editingTestId) {
                const res = await labTestAPI.updateLabTest(editingTestId, data);
                if (res.success) setSuccess('✅ Test updated!');
            } else {
                const res = await labTestAPI.createLabTest(data);
                if (res.success) setSuccess('✅ Test created!');
            }

            setShowTestForm(false);
            resetTestForm();
            fetchAll();
        } catch (err) {
            setError(err.response?.data?.message || 'Error saving test.');
        } finally {
            setLoading(false);
        }
    };

    const handleEditTest = (test) => {
        setTestForm({
            name: test.name,
            code: test.code || '',
            description: test.description || '',
            price: test.price || '',
            category: test.category || 'General',
            isActive: test.isActive
        });
        setEditingTestId(test._id);
        setShowTestForm(true);
        setActiveTab('tests');
    };

    const handleDeleteTest = async (id) => {
        if (!window.confirm('Are you sure you want to delete this test?')) return;
        try {
            const res = await labTestAPI.deleteLabTest(id);
            if (res.success) {
                setSuccess('Test deleted.');
                fetchAll();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error deleting test.');
        }
    };

    // === Find which packages a test belongs to ===
    const getPackagesForTest = (testId) => {
        return packages.filter(pkg =>
            pkg.tests?.some(t => (t._id || t) === testId)
        );
    };

    // === RENDER ===
    return (
        <div className="superadmin-page">
            <div className="superadmin-container">
                {/* Header */}
                <div className="admin-header">
                    <div>
                        <h1>Tests & Packages</h1>
                        <p>Create individual tests and bundle them into packages</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={() => { setShowTestForm(!showTestForm); setShowPackageForm(false); resetTestForm(); setActiveTab('tests'); }}
                            className="btn-edit"
                            style={{ padding: '10px 20px', fontSize: '0.95rem' }}
                        >
                            {showTestForm && !editingTestId ? '✕ Cancel' : '+ Add Test'}
                        </button>
                        <button
                            onClick={() => { setShowPackageForm(!showPackageForm); setShowTestForm(false); resetPackageForm(); setActiveTab('packages'); }}
                            className="btn-save"
                            style={{ padding: '10px 20px', fontSize: '0.95rem' }}
                        >
                            {showPackageForm && !editingPackageId ? '✕ Cancel' : '📦 Create Package'}
                        </button>
                    </div>
                </div>

                {/* Messages */}
                {error && <div className="error-message">⚠️ {error}</div>}
                {success && <div className="success-message">{success}</div>}

                {/* Stats */}
                <div className="test-stats-row">
                    <div className="test-stat-mini">
                        <span className="stat-icon">🧪</span>
                        <p className="stat-value">{tests.length}</p>
                        <p className="stat-label">Total Tests</p>
                    </div>
                    <div className="test-stat-mini">
                        <span className="stat-icon">📦</span>
                        <p className="stat-value">{packages.length}</p>
                        <p className="stat-label">Total Packages</p>
                    </div>
                    <div className="test-stat-mini">
                        <span className="stat-icon">✅</span>
                        <p className="stat-value">{tests.filter(t => t.isActive).length}</p>
                        <p className="stat-label">Active Tests</p>
                    </div>
                    <div className="test-stat-mini">
                        <span className="stat-icon">📂</span>
                        <p className="stat-value">{categories.length}</p>
                        <p className="stat-label">Categories</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="test-pkg-tabs">
                    <button
                        className={`test-pkg-tab ${activeTab === 'packages' ? 'active' : ''}`}
                        onClick={() => setActiveTab('packages')}
                    >
                        📦 Packages <span className="tab-count">{packages.length}</span>
                    </button>
                    <button
                        className={`test-pkg-tab ${activeTab === 'tests' ? 'active' : ''}`}
                        onClick={() => setActiveTab('tests')}
                    >
                        🧪 Individual Tests <span className="tab-count">{tests.length}</span>
                    </button>
                </div>

                {/* Search & Filter */}
                <div className="test-pkg-toolbar">
                    <div className="test-pkg-search">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder={activeTab === 'packages' ? 'Search packages...' : 'Search tests...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="test-pkg-filter-select"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                {/* ============== TEST FORM ============== */}
                {showTestForm && (
                    <div className="admin-card" style={{ marginBottom: '24px' }}>
                        <h2>{editingTestId ? '✏️ Edit Test' : '🧪 Add New Test'}</h2>
                        <form onSubmit={handleTestSubmit} className="user-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Test Name *</label>
                                    <input type="text" name="name" value={testForm.name} onChange={handleTestChange} required className="staff-input" placeholder="e.g. Complete Blood Count" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Test Code</label>
                                    <input type="text" name="code" value={testForm.code} onChange={handleTestChange} className="staff-input" placeholder="e.g. CBC" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Category</label>
                                    <input type="text" name="category" value={testForm.category} onChange={handleTestChange} className="staff-input" placeholder="e.g. Hematology" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Price (₹)</label>
                                    <input type="number" name="price" value={testForm.price} onChange={handleTestChange} className="staff-input" placeholder="e.g. 500" />
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="staff-label">Description</label>
                                <textarea name="description" value={testForm.description} onChange={handleTestChange} className="staff-input" rows="2" placeholder="e.g. Fasting required for 12 hours"></textarea>
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <input type="checkbox" id="testIsActive" name="isActive" checked={testForm.isActive} onChange={handleTestChange} style={{ width: '18px', height: '18px', accentColor: '#0d9488' }} />
                                <label htmlFor="testIsActive" style={{ fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Active (Visible to Doctors)</label>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={loading} className="submit-button" style={{ maxWidth: '200px' }}>
                                    {loading ? 'Saving...' : editingTestId ? 'Update Test' : 'Save Test'}
                                </button>
                                <button type="button" onClick={() => { setShowTestForm(false); resetTestForm(); }} className="btn-cancel" style={{ padding: '12px 24px', marginTop: '12px' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ============== PACKAGE FORM ============== */}
                {showPackageForm && (
                    <div className="admin-card" style={{ marginBottom: '24px' }}>
                        <h2>{editingPackageId ? '✏️ Edit Package' : '📦 Create New Package'}</h2>
                        <form onSubmit={handlePackageSubmit} className="user-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Package Name *</label>
                                    <input type="text" name="name" value={packageForm.name} onChange={handlePackageChange} required className="staff-input" placeholder="e.g. Complete Health Checkup" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Package Code</label>
                                    <input type="text" name="code" value={packageForm.code} onChange={handlePackageChange} className="staff-input" placeholder="e.g. CHC-001" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Category</label>
                                    <input type="text" name="category" value={packageForm.category} onChange={handlePackageChange} className="staff-input" placeholder="e.g. Preventive Health" />
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Status</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '8px' }}>
                                        <input type="checkbox" id="pkgIsActive" name="isActive" checked={packageForm.isActive} onChange={handlePackageChange} style={{ width: '18px', height: '18px', accentColor: '#0d9488' }} />
                                        <label htmlFor="pkgIsActive" style={{ fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Active</label>
                                    </div>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="staff-label">Description</label>
                                <textarea name="description" value={packageForm.description} onChange={handlePackageChange} className="staff-input" rows="2" placeholder="Describe what this package covers..."></textarea>
                            </div>

                            {/* TEST SELECTION */}
                            <div className="test-selection-section">
                                <div className="test-selection-header">
                                    <label className="staff-label" style={{ margin: 0 }}>Select Tests for this Package *</label>
                                    <span className="selected-count">
                                        {packageForm.tests.length} test{packageForm.tests.length !== 1 ? 's' : ''} selected
                                    </span>
                                </div>

                                {tests.length === 0 ? (
                                    <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>No tests available. Create tests first.</p>
                                ) : (
                                    <div className="test-checkboxes">
                                        {tests.map(test => (
                                            <label
                                                key={test._id}
                                                className={`test-checkbox-item ${packageForm.tests.includes(test._id) ? 'checked' : ''}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={packageForm.tests.includes(test._id)}
                                                    onChange={() => toggleTestInPackage(test._id)}
                                                />
                                                <div className="test-info">
                                                    <div className="test-name">{test.name}</div>
                                                    <div className="test-meta">{test.code ? `${test.code} • ` : ''}{test.category} • ₹{test.price}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}

                                {/* Price Preview */}
                                {packageForm.tests.length > 0 && (
                                    <div className="price-preview">
                                        <span className="price-label">Total individual test cost:</span>
                                        <span className="price-value">₹{totalTestPrice}</span>
                                    </div>
                                )}
                            </div>

                            {/* Package Pricing */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="staff-label">Package Price (₹)</label>
                                    <input type="number" name="price" value={packageForm.price} onChange={handlePackageChange} className="staff-input" placeholder={`Suggested: ₹${totalTestPrice}`} />
                                    <small style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                        Original total: ₹{totalTestPrice} • Set a discounted price
                                    </small>
                                </div>
                                <div className="form-group">
                                    <label className="staff-label">Discounted Price (₹) <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>optional</span></label>
                                    <input type="number" name="discountedPrice" value={packageForm.discountedPrice} onChange={handlePackageChange} className="staff-input" placeholder="e.g. 1299" />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="submit" disabled={loading || packageForm.tests.length === 0} className="submit-button" style={{ maxWidth: '220px' }}>
                                    {loading ? 'Saving...' : editingPackageId ? 'Update Package' : 'Create Package'}
                                </button>
                                <button type="button" onClick={() => { setShowPackageForm(false); resetPackageForm(); }} className="btn-cancel" style={{ padding: '12px 24px', marginTop: '12px' }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ============== PACKAGES TAB ============== */}
                {activeTab === 'packages' && (
                    <div>
                        {loading && !packages.length ? (
                            <div className="admin-card"><p>Loading packages...</p></div>
                        ) : filteredPackages.length === 0 ? (
                            <div className="admin-card">
                                <div className="empty-state">
                                    <span className="empty-icon">📦</span>
                                    <h3>{searchTerm || categoryFilter ? 'No packages match your filter' : 'No packages yet'}</h3>
                                    <p>
                                        {searchTerm || categoryFilter
                                            ? 'Try adjusting your search or filter criteria.'
                                            : 'Create your first test package by clicking "Create Package" button above.'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="packages-grid">
                                {filteredPackages.map(pkg => {
                                    const individualTotal = (pkg.tests || []).reduce((s, t) => s + (t.price || 0), 0);
                                    const displayPrice = pkg.discountedPrice || pkg.price || individualTotal;
                                    const savings = individualTotal > displayPrice ? Math.round(((individualTotal - displayPrice) / individualTotal) * 100) : 0;

                                    return (
                                        <div key={pkg._id} className="package-card">
                                            <div className="package-card-header">
                                                <div>
                                                    <h3>{pkg.name}</h3>
                                                    {pkg.code && <div className="package-code">{pkg.code}</div>}
                                                </div>
                                                <span className={`package-status ${pkg.isActive ? 'active' : 'inactive'}`}>
                                                    {pkg.isActive ? 'Active' : 'Hidden'}
                                                </span>
                                            </div>

                                            {pkg.description && (
                                                <div className="package-description">{pkg.description}</div>
                                            )}

                                            <div className="package-price-row">
                                                <span className="package-price">₹{displayPrice}</span>
                                                {savings > 0 && (
                                                    <>
                                                        <span className="package-original-price">₹{individualTotal}</span>
                                                        <span className="package-discount-badge">{savings}% OFF</span>
                                                    </>
                                                )}
                                            </div>

                                            <span className="category-badge">{pkg.category}</span>

                                            <div className="package-tests-list">
                                                <h4>Includes {pkg.tests?.length || 0} test{(pkg.tests?.length || 0) !== 1 ? 's' : ''}</h4>
                                                <div>
                                                    {(pkg.tests || []).map(test => (
                                                        <span key={test._id} className="test-chip">
                                                            {test.name}
                                                            <span className="test-chip-price">₹{test.price}</span>
                                                        </span>
                                                    ))}
                                                    {(!pkg.tests || pkg.tests.length === 0) && (
                                                        <span style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>No tests added yet</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="package-card-actions">
                                                <button onClick={() => handleEditPackage(pkg)} className="btn-edit" style={{ flex: 1 }}>Edit</button>
                                                <button onClick={() => handleDeletePackage(pkg._id)} className="btn-delete" style={{ flex: 1 }}>Delete</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ============== TESTS TAB ============== */}
                {activeTab === 'tests' && (
                    <div className="admin-card">
                        <h2>🧪 All Lab Tests</h2>
                        {loading && !tests.length ? (
                            <p>Loading tests...</p>
                        ) : (
                            <div className="users-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Code</th>
                                            <th>Category</th>
                                            <th>Price</th>
                                            <th>In Packages</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTests.map(test => {
                                            const testPackages = getPackagesForTest(test._id);
                                            return (
                                                <tr key={test._id}>
                                                    <td style={{ fontWeight: 600 }}>{test.name}</td>
                                                    <td>{test.code || '-'}</td>
                                                    <td><span className="category-badge">{test.category}</span></td>
                                                    <td style={{ fontWeight: 700, color: '#0d9488' }}>₹{test.price}</td>
                                                    <td>
                                                        {testPackages.length > 0 ? (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                {testPackages.map(p => (
                                                                    <span key={p._id} style={{
                                                                        fontSize: '0.75rem', padding: '2px 8px',
                                                                        background: 'rgba(13,148,136,0.08)', color: '#0f766e',
                                                                        borderRadius: '6px', fontWeight: 600
                                                                    }}>
                                                                        {p.name}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700,
                                                            backgroundColor: test.isActive ? '#dcfce7' : '#f1f5f9',
                                                            color: test.isActive ? '#166534' : '#64748b'
                                                        }}>
                                                            {test.isActive ? 'Active' : 'Hidden'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="action-buttons">
                                                            <button onClick={() => handleEditTest(test)} className="btn-edit">Edit</button>
                                                            <button onClick={() => handleDeleteTest(test._id)} className="btn-delete">Delete</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {filteredTests.length === 0 && (
                                            <tr>
                                                <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                                    {searchTerm || categoryFilter ? 'No tests match your filter.' : 'No tests defined yet.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTestPackages;
