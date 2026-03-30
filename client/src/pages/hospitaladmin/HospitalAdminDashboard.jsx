import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../store/hooks';
import { updateUser as updateUserAction } from '../../store/slices/authSlice';
import { adminAPI, uploadAPI, hospitalAPI } from '../../utils/api';
import '../administration/SuperAdmin.css';
import './HospitalAdminDashboard.css';

const HospitalAdminDashboard = () => {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const [activeTab, setActiveTab] = useState('overview');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // My Profile state
    const [profileFile, setProfileFile] = useState(null);
    const [savingProfile, setSavingProfile] = useState(false);

    // Hospital info
    const [hospitalInfo, setHospitalInfo] = useState(null);

    // Users state
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [roles, setRoles] = useState([]);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', email: '', password: '', phone: '', roleId: '', file: null, department: ''
    });
    const [creating, setCreating] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [editForm, setEditForm] = useState({
        id: '', name: '', email: '', phone: '', roleId: '', currentAvatar: '', newAvatarFile: null, specialty: '', department: ''
    });
    const [updating, setUpdating] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const [stats, setStats] = useState({ totalUsers: 0, totalDoctors: 0, totalPatients: 0, totalRoles: 0 });

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    // --- Stats & Date Filtering State ---
    const [datePreset, setDatePreset] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [hospitalStats, setHospitalStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // --- Inventory State ---
    const [inventory, setInventory] = useState([]);
    const [loadingInventory, setLoadingInventory] = useState(false);
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [editingInventoryId, setEditingInventoryId] = useState(null);
    const [inventoryForm, setInventoryForm] = useState({
        name: '', salt: '', category: 'General', stock: '', unit: 'Tablets',
        buyingPrice: '', sellingPrice: '', vendor: '', batchNumber: '', expiryDate: ''
    });
    const [savingInventory, setSavingInventory] = useState(false);

    // --- Lab Test Pricing State ---
    const [labTests, setLabTests] = useState([]);
    const [loadingLabTests, setLoadingLabTests] = useState(false);
    const [savingLabPrice, setSavingLabPrice] = useState(null);
    const [labPriceInputs, setLabPriceInputs] = useState({});
    const [showLabTestForm, setShowLabTestForm] = useState(false);
    const [savingLabTest, setSavingLabTest] = useState(false);
    const [labTestForm, setLabTestForm] = useState({ name: '', code: '', description: '', price: '', category: 'General' });

    // Auth check
    useEffect(() => {
        const role = currentUser?.role;
        if (role !== 'hospitaladmin') {
            navigate('/hospitaladmin/login');
        }
    }, [navigate]);

    useEffect(() => {
        fetchMyHospital();
        fetchUsers();
        fetchRoles();
    }, []);

    // Fetch data when switching to inventory or lab pricing tabs
    useEffect(() => {
        if (activeTab === 'inventory' && inventory.length === 0) fetchInventory();
        if (activeTab === 'labpricing' && labTests.length === 0) fetchLabTests();
    }, [activeTab]);

    const fetchMyHospital = async () => {
        try {
            const res = await hospitalAPI.getMyHospital();
            if (res.success && res.hospital) {
                setHospitalInfo(res.hospital);
                fetchHospitalStats(res.hospital._id, 'all', '', '');
            }
        } catch (err) {
            console.error('Error fetching hospital info:', err);
        }
    };

    const fetchHospitalStats = async (hospitalId, preset = datePreset, start = customStartDate, end = customEndDate) => {
        try {
            setLoadingStats(true);
            setHospitalStats(null);

            let queryStart = '';
            let queryEnd = '';

            if (preset !== 'all' && preset !== 'custom') {
                const now = new Date();
                const endD = new Date(now);
                const startD = new Date(now);

                if (preset === 'today') {
                    startD.setHours(0, 0, 0, 0);
                    endD.setHours(23, 59, 59, 999);
                } else if (preset === '30') {
                    startD.setDate(startD.getDate() - 30);
                } else if (preset === '60') {
                    startD.setDate(startD.getDate() - 60);
                } else if (preset === '90') {
                    startD.setDate(startD.getDate() - 90);
                }

                queryStart = startD.toISOString();
                queryEnd = endD.toISOString();
            } else if (preset === 'custom') {
                if (start) queryStart = new Date(start).toISOString();
                if (end) queryEnd = new Date(end).toISOString();
            }

            const res = await hospitalAPI.getHospitalStats(hospitalId, queryStart, queryEnd);
            if (res.success) setHospitalStats(res);
        } catch (err) {
            console.error('Stats error:', err);
            setHospitalStats(null);
        } finally { setLoadingStats(false); }
    };

    const handleDatePresetChange = (preset) => {
        setDatePreset(preset);
        if (preset !== 'custom' && hospitalInfo) {
            fetchHospitalStats(hospitalInfo._id, preset, customStartDate, customEndDate);
        }
    };

    const handleApplyCustomDate = () => {
        if (hospitalInfo) {
            fetchHospitalStats(hospitalInfo._id, 'custom', customStartDate, customEndDate);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoadingUsers(true);
            const res = await adminAPI.getUsers();
            if (res.success) {
                setUsers(res.users);
                setStats({
                    totalUsers: res.users.length,
                    totalDoctors: res.users.filter(u => (u.role || '').toLowerCase().includes('doctor')).length,
                    totalPatients: res.users.filter(u => (u.role || '').toLowerCase() === 'patient').length,
                    totalRoles: 0
                });
            }
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await adminAPI.getRoles();
            if (res.success) {
                setRoles(res.data);
                setStats(prev => ({ ...prev, totalRoles: res.data.length }));
            }
        } catch (err) {
            console.error('Error fetching roles:', err);
        }
    };

    const handleCreateStaff = async (e) => {
        e.preventDefault();
        setCreating(true);
        setError('');
        setSuccess('');

        if (!createForm.name || !createForm.email || !createForm.password || !createForm.roleId) {
            setError('Name, email, password, and role are all required.');
            setCreating(false);
            return;
        }

        try {
            let avatarUrl = null;
            if (createForm.file) {
                const formData = new FormData();
                formData.append('images', createForm.file);
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) avatarUrl = uploadRes.files[0].url;
            }

            const userData = { ...createForm, avatar: avatarUrl, departments: createForm.department ? [createForm.department] : [] };
            const res = await adminAPI.createUser(userData);
            if (res.success) {
                setSuccess(`✅ ${res.user?.role || 'Staff'} account created! Login: ${createForm.email}`);
                setCreateForm({ name: '', email: '', password: '', phone: '', roleId: '', file: null, department: '' });
                setShowCreateForm(false);
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error creating staff account.');
        } finally {
            setCreating(false);
        }
    };

    const handleUpdateUser = async (e) => {
        e.preventDefault();
        setUpdating(true);
        setError('');
        setSuccess('');
        try {
            let avatarUrl = editForm.currentAvatar;
            if (editForm.newAvatarFile) {
                const formData = new FormData();
                formData.append('images', editForm.newAvatarFile);
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) avatarUrl = uploadRes.files[0].url;
            }
            const updateData = {
                name: editForm.name, email: editForm.email, phone: editForm.phone,
                roleId: editForm.roleId, avatar: avatarUrl, specialty: editForm.specialty,
                departments: editForm.department ? [editForm.department] : []
            };
            const res = await adminAPI.updateUser(editForm.id, updateData);
            if (res.success) {
                setSuccess('User updated successfully!');
                setEditModal(false);
                fetchUsers();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error updating user.');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        try {
            const res = await adminAPI.deleteUser(userId);
            if (res.success) {
                setSuccess('User deleted successfully!');
                setDeleteConfirm(null);
                fetchUsers();
            }
        } catch (err) {
            setError('Error deleting user.');
            setDeleteConfirm(null);
        }
    };

    const openEditModal = (userItem) => {
        setEditForm({
            id: userItem.id || userItem._id,
            name: userItem.name, email: userItem.email, phone: userItem.phone || '',
            roleId: userItem.roleId || userItem.role,
            currentAvatar: userItem.avatar, newAvatarFile: null, specialty: userItem.specialty || '',
            department: (userItem.departments && userItem.departments.length > 0) ? userItem.departments[0] : ''
        });
        setEditModal(true);
        setError('');
        setSuccess('');
    };


    // --- Inventory Functions ---
    const fetchInventory = async () => {
        setLoadingInventory(true);
        try {
            const res = await hospitalAPI.getInventory();
            if (res.success) setInventory(res.data);
        } catch (err) { console.error(err); } finally { setLoadingInventory(false); }
    };

    const resetInventoryForm = () => {
        setInventoryForm({ name: '', salt: '', category: 'General', stock: '', unit: 'Tablets', buyingPrice: '', sellingPrice: '', vendor: '', batchNumber: '', expiryDate: '' });
        setEditingInventoryId(null);
        setShowInventoryForm(false);
    };

    const handleInventorySubmit = async (e) => {
        e.preventDefault();
        setSavingInventory(true); setError(''); setSuccess('');
        try {
            const data = { ...inventoryForm, stock: Number(inventoryForm.stock), buyingPrice: Number(inventoryForm.buyingPrice), sellingPrice: Number(inventoryForm.sellingPrice) };
            if (editingInventoryId) {
                await hospitalAPI.updateInventory(editingInventoryId, data);
                setSuccess('Item updated!');
            } else {
                await hospitalAPI.addInventory(data);
                setSuccess('Item added!');
            }
            resetInventoryForm();
            fetchInventory();
        } catch (err) { setError(err.response?.data?.message || 'Error saving item.'); }
        finally { setSavingInventory(false); }
    };

    const handleEditInventory = (item) => {
        setInventoryForm({
            name: item.name, salt: item.salt || '', category: item.category, stock: item.stock,
            unit: item.unit, buyingPrice: item.buyingPrice, sellingPrice: item.sellingPrice,
            vendor: item.vendor || '', batchNumber: item.batchNumber || '',
            expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : ''
        });
        setEditingInventoryId(item._id);
        setShowInventoryForm(true);
    };

    const handleDeleteInventory = async (id) => {
        if (!window.confirm('Delete this inventory item?')) return;
        try {
            await hospitalAPI.deleteInventory(id);
            setSuccess('Item deleted.');
            fetchInventory();
        } catch (err) { setError('Error deleting item.'); }
    };

    // --- Lab Test Pricing Functions ---
    const fetchLabTests = async () => {
        setLoadingLabTests(true);
        try {
            const res = await hospitalAPI.getHospitalLabTests();
            if (res.success) {
                setLabTests(res.data);
                const inputs = {};
                res.data.forEach(t => { inputs[t._id] = t.hospitalPrice !== null ? String(t.hospitalPrice) : ''; });
                setLabPriceInputs(inputs);
            }
        } catch (err) { console.error(err); } finally { setLoadingLabTests(false); }
    };

    const handleSaveLabPrice = async (testId) => {
        setSavingLabPrice(testId); setError('');
        try {
            const val = labPriceInputs[testId];
            await hospitalAPI.setLabTestPrice(testId, val === '' ? null : Number(val));
            setSuccess('Lab test price updated!');
            fetchLabTests();
        } catch (err) { setError('Error saving price.'); }
        finally { setSavingLabPrice(null); }
    };

    const handleCreateLabTest = async (e) => {
        e.preventDefault();
        if (!labTestForm.name.trim()) return setError('Test name is required.');
        setSavingLabTest(true); setError('');
        try {
            const res = await hospitalAPI.createLabTest({
                ...labTestForm,
                price: Number(labTestForm.price) || 0
            });
            if (res.success) {
                setSuccess('Lab test added successfully!');
                setShowLabTestForm(false);
                setLabTestForm({ name: '', code: '', description: '', price: '', category: 'General' });
                fetchLabTests();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error creating lab test.');
        } finally { setSavingLabTest(false); }
    };

    const handleDeleteLabTest = async (testId) => {
        if (!window.confirm('Delete this lab test? This cannot be undone.')) return;
        setError('');
        try {
            const res = await hospitalAPI.deleteLabTest(testId);
            if (res.success) {
                setSuccess('Lab test deleted.');
                fetchLabTests();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Error deleting lab test.');
        }
    };

    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    const handleSaveProfilePhoto = async () => {
        if (!profileFile) return;
        setSavingProfile(true);
        setError(''); setSuccess('');
        try {
            const formData = new FormData();
            formData.append('images', profileFile);
            const uploadRes = await uploadAPI.uploadImages(formData);
            if (uploadRes.success && uploadRes.files?.length > 0) {
                const avatarUrl = uploadRes.files[0].url;
                await adminAPI.updateUser(currentUser.id || currentUser._id, { avatar: avatarUrl });
                dispatch(updateUserAction({ avatar: avatarUrl }));
                setSuccess('Profile photo updated successfully!');
                setProfileFile(null);
                setTimeout(() => setSuccess(''), 3000);
            }
        } catch (err) {
            setError('Failed to update profile photo.');
        } finally {
            setSavingProfile(false);
        }
    };

    const tabs = [
        { id: 'overview', label: '📊 Overview' },
        { id: 'staff', label: '👤 Staff' },
        { id: 'departments', label: '🏢 Departments' },
        { id: 'facilities', label: '🛏️ Facilities' },
        { id: 'inventory', label: '💊 Inventory' },
        { id: 'labpricing', label: '🧪 Lab Pricing' },
    ];

    // Hospital Admin can navigate to operations but NOT to question library / test packages / medicines
    const operationLinks = [
        { icon: '👨‍⚕️', label: 'Doctors', desc: 'Manage doctor profiles & schedules', path: '/admin/doctors', bg: '#dbeafe', color: '#2563eb' },
        { icon: '🧪', label: 'Labs', desc: 'Configure lab departments', path: '/admin/labs', bg: '#f3e8ff', color: '#9333ea' },
        { icon: '💊', label: 'Pharmacy', desc: 'Pharmacy inventory & orders', path: '/admin/pharmacy', bg: '#ffedd5', color: '#ea580c' },
        { icon: '🏥', label: 'Reception', desc: 'Reception & appointments', path: '/admin/reception', bg: '#dcfce7', color: '#16a34a' },
        { icon: '🛠️', label: 'Services', desc: 'Hospital services & pricing', path: '/admin/services', bg: '#fefce8', color: '#ca8a04' },
        { icon: '👥', label: 'Manage Users', desc: 'View and manage all staff', path: '/admin/users', bg: '#f0f9ff', color: '#0284c7' },
        { icon: '📝', label: 'Question Library', desc: 'Manage diagnostic questions', path: '/hospitaladmin/question-library', bg: '#fdf2f8', color: '#be185d' },
    ];

    return (
        <div className="hospitaladmin-page">
            <div className="hospitaladmin-container">
                {/* Header */}
                {/* Redundant Header Removed (now in TopBar) */}
                <div style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                         <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'var(--brand-50, #f0fdfa)', color: 'var(--brand-600, #14b8a6)', padding: '4px 10px', borderRadius: '4px', letterSpacing: '0.05em' }}>
                            {hospitalInfo ? `🏥 ${hospitalInfo.name.toUpperCase()}` : 'HOSPITAL ADMIN'}
                         </span>
                    </div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 850, margin: '8px 0 4px', color: '#1e293b' }}>Hospital Administration Dashboard</h1>
                    <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Manage staff, departments, and hospital operations</p>
                </div>

                {error && <div className="error-message">⚠️ {error}</div>}
                {success && <div className="success-message">✅ {success}</div>}

                {/* Tab Nav */}
                <div className="ha-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`ha-tab ${activeTab === tab.id ? 'ha-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ===================== OVERVIEW TAB ===================== */}
                {activeTab === 'overview' && (
                    <>
                        {/* ---- DATE FILTER BAR ---- */}
                        <div className="admin-card date-filter-card">
                            <h3>📅 Analytics Timeframe</h3>
                            <div className="date-filter-controls">
                                <div className="preset-buttons">
                                    <button className={datePreset === 'all' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('all')}>All Time</button>
                                    <button className={datePreset === 'today' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('today')}>Today</button>
                                    <button className={datePreset === '30' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('30')}>Last 30 Days</button>
                                    <button className={datePreset === '60' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('60')}>Last 60 Days</button>
                                    <button className={datePreset === '90' ? 'preset-btn active' : 'preset-btn'} onClick={() => handleDatePresetChange('90')}>Last 90 Days</button>
                                </div>
                                <div className="custom-date-inputs">
                                    <input type="date" className="date-input" value={customStartDate} onChange={(e) => { setDatePreset('custom'); setCustomStartDate(e.target.value); }} />
                                    <span>to</span>
                                    <input type="date" className="date-input" value={customEndDate} onChange={(e) => { setDatePreset('custom'); setCustomEndDate(e.target.value); }} />
                                    <button className="btn-save" onClick={handleApplyCustomDate}>Apply Custom</button>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        {loadingStats ? (
                            <div className="loading-message" style={{ padding: '60px', textAlign: 'center', fontSize: '18px' }}>
                                ⏳ Loading hospital analytics...
                            </div>
                        ) : hospitalStats?.stats ? (
                            <div className="hospital-kpi-grid">
                                <div className="kpi-card kpi-blue">
                                    <div className="kpi-icon">👩‍⚕️</div>
                                    <div className="kpi-value">{hospitalStats.stats.totalStaff}</div>
                                    <div className="kpi-label">Total Staff</div>
                                    <div className="kpi-sub">{hospitalStats.stats.doctorCount} doctors · {hospitalStats.stats.labCount} labs </div>
                                </div>
                                <div className="kpi-card kpi-green">
                                    <div className="kpi-icon">🧑‍🤝‍🧑</div>
                                    <div className="kpi-value">{hospitalStats.stats.totalPatients}</div>
                                    <div className="kpi-label">Unique Patients</div>
                                    <div className="kpi-sub">In selected period</div>
                                </div>
                                <div className="kpi-card kpi-purple">
                                    <div className="kpi-icon">📅</div>
                                    <div className="kpi-value">{hospitalStats.stats.totalAppointments}</div>
                                    <div className="kpi-label">Total Appointments</div>
                                    <div className="kpi-sub">In selected period</div>
                                </div>
                                <div className="kpi-card kpi-orange">
                                    <div className="kpi-icon">💰</div>
                                    <div className="kpi-value">{formatCurrency(hospitalStats.stats.totalRevenue)}</div>
                                    <div className="kpi-label">Total Revenue</div>
                                    <div className="kpi-sub">From paid appointments</div>
                                </div>
                                <div className="kpi-card kpi-teal">
                                    <div className="kpi-icon">✅</div>
                                    <div className="kpi-value">{hospitalStats.stats.completedAppointments}</div>
                                    <div className="kpi-label">Completed</div>
                                    <div className="kpi-sub">{hospitalStats.stats.pendingAppointments} pending/upcoming</div>
                                </div>
                                <div className="kpi-card kpi-pink">
                                    <div className="kpi-icon">🧪</div>
                                    <div className="kpi-value">{hospitalStats.stats.labReportCount}</div>
                                    <div className="kpi-label">Lab Reports</div>
                                    <div className="kpi-sub">{hospitalStats.stats.pendingLabReports} pending</div>
                                </div>
                            </div>
                        ) : null}

                        {/* Quick Operations */}
                        <div className="admin-card">
                            <h2>⚡ Quick Operations</h2>
                            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 20px' }}>
                                Jump to the areas you manage most frequently. Contact your Central Admin to manage question libraries, test packages, or medicine catalogs.
                            </p>
                            <div className="ha-ops-grid">
                                {operationLinks.map((item, i) => (
                                    <div
                                        key={i}
                                        className="ha-op-card"
                                        onClick={() => navigate(item.path)}
                                        style={{ background: item.bg, borderColor: item.color + '30' }}
                                    >
                                        <span className="ha-op-icon" style={{ color: item.color }}>{item.icon}</span>
                                        <div>
                                            <h4 style={{ color: item.color }}>{item.label}</h4>
                                            <p>{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* My Profile Card */}
                        <div className="admin-card" style={{ marginTop: '24px' }}>
                            <h2>👤 My Profile</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{ flexShrink: 0 }}>
                                    {profileFile ? (
                                        <img src={URL.createObjectURL(profileFile)} alt="Preview" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--brand-500, #14b8a6)' }} />
                                    ) : currentUser?.avatar ? (
                                        <img src={currentUser.avatar} alt={currentUser.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--brand-500, #14b8a6)' }} />
                                    ) : (
                                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 700, color: '#6366f1', border: '3px solid #c7d2fe' }}>
                                            {(currentUser?.name || 'A').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '16px', color: '#1e293b' }}>{currentUser?.name}</p>
                                    <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>{currentUser?.email}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <input type="file" accept="image/*" id="profilePhotoInput" style={{ display: 'none' }}
                                            onChange={e => setProfileFile(e.target.files[0])} />
                                        <label htmlFor="profilePhotoInput" style={{ padding: '8px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                            📷 Choose Photo
                                        </label>
                                        {profileFile && (
                                            <button onClick={handleSaveProfilePhoto} disabled={savingProfile} className="btn-save" style={{ padding: '8px 16px', fontSize: '13px' }}>
                                                {savingProfile ? 'Saving...' : 'Save Photo'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Hospital Info */}
                        {hospitalInfo && (
                            <div className="admin-card" style={{ marginTop: '24px' }}>
                                <h2>🏥 My Hospital</h2>
                                <div className="ha-hospital-info">
                                    <div><strong>Name:</strong> {hospitalInfo.name}</div>
                                    {hospitalInfo.city && <div><strong>City:</strong> {hospitalInfo.city}{hospitalInfo.state ? `, ${hospitalInfo.state}` : ''}</div>}
                                    {hospitalInfo.phone && <div><strong>Phone:</strong> {hospitalInfo.phone}</div>}
                                    {hospitalInfo.email && <div><strong>Email:</strong> {hospitalInfo.email}</div>}
                                    {hospitalInfo.address && <div><strong>Address:</strong> {hospitalInfo.address}</div>}
                                    <div><strong>Appointment Fee:</strong> {formatCurrency(hospitalInfo.appointmentFee ?? 500)}</div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ===================== STAFF TAB ===================== */}
                {activeTab === 'staff' && (
                    <div>
                        {/* Staff Management Quick Actions */}
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <h2 style={{ marginBottom: '12px' }}>⚡ Staff Management</h2>
                            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 16px' }}>Manage your hospital's staff and doctors from here.</p>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => navigate('/admin/doctors')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#dbeafe', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    👨‍⚕️ Manage Doctors
                                </button>
                                <button
                                    onClick={() => navigate('/admin/roles')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: '#f3e8ff', color: '#9333ea', border: '1px solid #e9d5ff', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                                >
                                    🔑 Manage Roles
                                </button>
                            </div>
                        </div>

                        {/* Create Staff Form */}
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2>👤 Create Staff Account</h2>
                                <button onClick={() => setShowCreateForm(!showCreateForm)} className={showCreateForm ? 'btn-cancel' : 'btn-save'} style={{ padding: '8px 20px', fontSize: '14px' }}>
                                    {showCreateForm ? 'Cancel' : '+ New Staff'}
                                </button>
                            </div>
                            {!showCreateForm && <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>Create login credentials for doctors, lab technicians, pharmacists, and other staff.</p>}
                            {showCreateForm && (
                                <form onSubmit={handleCreateStaff} className="user-form">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Full Name *</label>
                                            <input type="text" placeholder="e.g. Dr. Sharma" value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required className="staff-input" />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Email Address *</label>
                                            <input type="email" placeholder="staff@hospital.com" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required className="staff-input" />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Password *</label>
                                            <input type="text" placeholder="Temporary password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required className="staff-input" />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Phone</label>
                                            <input type="text" placeholder="Phone number" value={createForm.phone} onChange={e => setCreateForm({ ...createForm, phone: e.target.value })} className="staff-input" />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Profile Image</label>
                                            <input type="file" accept="image/*" onChange={e => setCreateForm({ ...createForm, file: e.target.files[0] })} className="staff-input" style={{ padding: '10px' }} />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Assign Role *</label>
                                            <select value={createForm.roleId} onChange={e => setCreateForm({ ...createForm, roleId: e.target.value })} required className="staff-input">
                                                <option value="">-- Select a Role --</option>
                                                {roles.map(role => (
                                                    <option key={role._id} value={role._id}>{role.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {hospitalInfo && hospitalInfo.departments && hospitalInfo.departments.length > 0 && (
                                        <div className="form-row" style={{ marginTop: '10px' }}>
                                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                                <label className="staff-label">Assign Department (Optional - Leave blank to allow all)</label>
                                                <select
                                                    value={createForm.department}
                                                    onChange={(e) => setCreateForm(prev => ({ ...prev, department: e.target.value }))}
                                                    className="staff-input"
                                                    style={{ marginTop: '8px' }}
                                                >
                                                    <option value="">-- Select Department --</option>
                                                    {hospitalInfo.departments.map(dept => (
                                                        <option key={dept} value={dept}>{dept}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}

                                    <button type="submit" disabled={creating} className="submit-button" style={{ marginTop: '20px' }}>
                                        {creating ? 'Creating Account...' : '✅ Create Staff Account'}
                                    </button>
                                </form>
                            )}
                        </div>

                        {/* Users Table */}
                        <div className="admin-card">
                            <h2>All Staff & Users</h2>
                            {loadingUsers ? (
                                <div className="loading-message">Loading users...</div>
                            ) : users.length === 0 ? (
                                <div className="empty-message">No users found</div>
                            ) : (
                                <div className="users-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Avatar</th>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Role</th>
                                                <th>Phone</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {users.map(userItem => {
                                                const isCurrentUser = (userItem.id || userItem._id) === currentUser.id;
                                                const isSuperUser = ['centraladmin', 'superadmin'].includes(userItem.role?.toLowerCase());
                                                return (
                                                    <tr key={userItem.id || userItem._id}>
                                                        <td>
                                                            {userItem.avatar ? (
                                                                <img src={userItem.avatar} alt={userItem.name} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                                            ) : (
                                                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                                                                    {userItem.name?.charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td>{userItem.name}</td>
                                                        <td>{userItem.email}</td>
                                                        <td>
                                                            <span className={`role-badge role-${(userItem.role || '').toLowerCase()}`}>
                                                                {(userItem.role || 'No Role').toUpperCase()}
                                                            </span>
                                                        </td>
                                                        <td>{userItem.phone || '-'}</td>
                                                        <td>
                                                            <div className="action-buttons">
                                                                {!isCurrentUser && !isSuperUser && (
                                                                    <>
                                                                        <button onClick={() => openEditModal(userItem)} className="btn-edit">Edit</button>
                                                                        <button onClick={() => setDeleteConfirm(userItem.id || userItem._id)} className="btn-delete">Delete</button>
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
                    </div>
                )}

                {/* ===================== DEPARTMENTS TAB ===================== */}
                {activeTab === 'departments' && (
                    <div className="admin-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div>
                                <h2>💵 Department Consultation Fees</h2>
                                <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>
                                    Configure the consultation fee for each department. Receptionists cannot alter these fees during booking.
                                </p>
                            </div>
                            <button
                                className="btn-save"
                                style={{ padding: '8px 20px', whiteSpace: 'nowrap' }}
                                onClick={async () => {
                                    try {
                                        setError('');
                                        await hospitalAPI.updateDepartmentFees({ departmentFees: hospitalInfo.departmentFees });
                                        setSuccess('All department fees saved!');
                                        setTimeout(() => setSuccess(''), 3000);
                                    } catch (err) {
                                        setError('Error saving fees');
                                    }
                                }}
                            >
                                Save All Fees
                            </button>
                        </div>

                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Department</th>
                                        <th>Consultation Fee (₹)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(hospitalInfo?.departments || []).length === 0 ? (
                                        <tr><td colSpan="2" style={{ textAlign: 'center', color: '#666' }}>No departments assigned yet. Contact Central Admin.</td></tr>
                                    ) : (
                                        hospitalInfo.departments.map(dept => (
                                            <tr key={dept}>
                                                <td style={{ fontWeight: '500' }}>{dept}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ color: '#64748b' }}>₹</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            className="staff-input"
                                                            style={{ width: '140px', padding: '8px 12px' }}
                                                            value={hospitalInfo?.departmentFees?.[dept] ?? hospitalInfo?.appointmentFee ?? 500}
                                                            onChange={(e) => {
                                                                const newFee = Number(e.target.value);
                                                                setHospitalInfo(prev => ({
                                                                    ...prev,
                                                                    departmentFees: { ...(prev.departmentFees || {}), [dept]: newFee }
                                                                }));
                                                            }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===================== FACILITIES TAB ===================== */}
                {activeTab === 'facilities' && (
                    <div className="admin-card">
                        <h2>🛏️ Manage Facilities & Rooms</h2>
                        <p style={{ color: '#888', fontSize: '14px', margin: '0 0 20px' }}>
                            Add facilities like ICU, NCU, Deluxe Rooms, and their per-day pricing.
                        </p>
                        
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!e.target.name.value || !e.target.price.value) return;
                            try {
                                const newFacility = { name: e.target.name.value, pricePerDay: Number(e.target.price.value) };
                                const newFacilities = [...(hospitalInfo?.facilities || []), newFacility];
                                const res = await hospitalAPI.updateFacilities({ facilities: newFacilities });
                                if (res.success) {
                                    setHospitalInfo(res.hospital);
                                    setSuccess('Facility added successfully!');
                                    e.target.reset();
                                }
                            } catch (err) { setError('Error adding facility'); }
                        }} className="user-form" style={{ marginBottom: '30px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
                            <div className="form-row" style={{ alignItems: 'flex-end' }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="staff-label">Facility/Room Name</label>
                                    <input type="text" name="name" placeholder="e.g. ICU" required className="staff-input" />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="staff-label">Price Per Day (₹)</label>
                                    <input type="number" name="price" placeholder="e.g. 5000" min="0" required className="staff-input" />
                                </div>
                                <button type="submit" className="btn-save" style={{ height: '42px', padding: '0 20px' }}>+ Add Facility</button>
                            </div>
                        </form>

                        <div className="users-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Facility Name</th>
                                        <th>Price Per Day</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(hospitalInfo?.facilities || []).length === 0 ? (
                                        <tr><td colSpan="3" style={{ textAlign: 'center', color: '#666' }}>No facilities added yet.</td></tr>
                                    ) : (
                                        hospitalInfo.facilities.map((fac, idx) => (
                                            <tr key={idx}>
                                                <td>{fac.name}</td>
                                                <td>{formatCurrency(fac.pricePerDay)}/day</td>
                                                <td>
                                                    <button onClick={async () => {
                                                        if (!window.confirm('Delete this facility?')) return;
                                                        try {
                                                            const newFacilities = hospitalInfo.facilities.filter((_, i) => i !== idx);
                                                            const res = await hospitalAPI.updateFacilities({ facilities: newFacilities });
                                                            if (res.success) setHospitalInfo(res.hospital);
                                                        } catch (err) { setError('Error deleting facility'); }
                                                    }} className="btn-delete" style={{ padding: '4px 12px', fontSize: '13px' }}>Delete</button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ===================== INVENTORY TAB ===================== */}
                {activeTab === 'inventory' && (
                    <div>
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div>
                                    <h2>💊 Medicine Inventory</h2>
                                    <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>Manage your hospital's medicine stock, pricing, and expiry tracking</p>
                                </div>
                                <button
                                    onClick={() => { if (showInventoryForm && !editingInventoryId) { resetInventoryForm(); } else { resetInventoryForm(); setShowInventoryForm(true); } }}
                                    className={showInventoryForm ? 'btn-cancel' : 'btn-save'}
                                    style={{ padding: '8px 20px' }}
                                >
                                    {showInventoryForm ? 'Cancel' : '+ Add Medicine'}
                                </button>
                            </div>

                            {showInventoryForm && (
                                <form onSubmit={handleInventorySubmit} className="user-form" style={{ background: '#f8fafc', padding: '20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
                                    <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#334155' }}>{editingInventoryId ? 'Edit Medicine' : 'Add New Medicine'}</h3>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Medicine Name *</label>
                                            <input type="text" className="staff-input" placeholder="e.g. Paracetamol 500mg" value={inventoryForm.name} onChange={e => setInventoryForm({ ...inventoryForm, name: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Salt / Composition</label>
                                            <input type="text" className="staff-input" placeholder="e.g. Acetaminophen" value={inventoryForm.salt} onChange={e => setInventoryForm({ ...inventoryForm, salt: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Category *</label>
                                            <input type="text" className="staff-input" placeholder="e.g. Analgesic" value={inventoryForm.category} onChange={e => setInventoryForm({ ...inventoryForm, category: e.target.value })} required />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Stock Qty *</label>
                                            <input type="number" className="staff-input" placeholder="e.g. 500" min="0" value={inventoryForm.stock} onChange={e => setInventoryForm({ ...inventoryForm, stock: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Unit</label>
                                            <select className="staff-input" value={inventoryForm.unit} onChange={e => setInventoryForm({ ...inventoryForm, unit: e.target.value })}>
                                                {['Tablets', 'Capsules', 'Bottles', 'Vials', 'Strips', 'Packs', 'Tubes', 'Sachets', 'ml', 'mg'].map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Batch Number</label>
                                            <input type="text" className="staff-input" placeholder="e.g. BT-2026-001" value={inventoryForm.batchNumber} onChange={e => setInventoryForm({ ...inventoryForm, batchNumber: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Cost Price (₹) *</label>
                                            <input type="number" className="staff-input" placeholder="e.g. 30" min="0" step="0.01" value={inventoryForm.buyingPrice} onChange={e => setInventoryForm({ ...inventoryForm, buyingPrice: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Selling Price (₹) *</label>
                                            <input type="number" className="staff-input" placeholder="e.g. 50" min="0" step="0.01" value={inventoryForm.sellingPrice} onChange={e => setInventoryForm({ ...inventoryForm, sellingPrice: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Profit Margin</label>
                                            <input type="text" className="staff-input" readOnly
                                                style={{ background: '#f1f5f9', fontWeight: 700, color: Number(inventoryForm.sellingPrice) > Number(inventoryForm.buyingPrice) ? '#059669' : '#dc2626' }}
                                                value={inventoryForm.buyingPrice && inventoryForm.sellingPrice ? `₹${(Number(inventoryForm.sellingPrice) - Number(inventoryForm.buyingPrice)).toFixed(2)} (${((Number(inventoryForm.sellingPrice) - Number(inventoryForm.buyingPrice)) / (Number(inventoryForm.buyingPrice) || 1) * 100).toFixed(1)}%)` : '--'}
                                            />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Expiry Date *</label>
                                            <input type="date" className="staff-input" value={inventoryForm.expiryDate} onChange={e => setInventoryForm({ ...inventoryForm, expiryDate: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Vendor / Supplier</label>
                                            <input type="text" className="staff-input" placeholder="e.g. MedSupply Co." value={inventoryForm.vendor} onChange={e => setInventoryForm({ ...inventoryForm, vendor: e.target.value })} />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={savingInventory} className="submit-button" style={{ marginTop: '16px', maxWidth: '220px' }}>
                                        {savingInventory ? 'Saving...' : editingInventoryId ? 'Update Medicine' : 'Add Medicine'}
                                    </button>
                                </form>
                            )}
                        </div>

                        {/* Inventory Table */}
                        <div className="admin-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2>Current Stock ({inventory.length} items)</h2>
                                {!inventory.length && !loadingInventory && (
                                    <button onClick={fetchInventory} className="btn-edit" style={{ padding: '6px 14px', fontSize: '13px' }}>Load Inventory</button>
                                )}
                            </div>
                            {loadingInventory ? (
                                <div className="loading-message">Loading inventory...</div>
                            ) : (
                                <div className="users-table" style={{ overflowX: 'auto' }}>
                                    <table style={{ minWidth: '1100px' }}>
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Salt / Composition</th>
                                                <th>Category</th>
                                                <th>Stock</th>
                                                <th>Cost (₹)</th>
                                                <th>Sell (₹)</th>
                                                <th>Margin</th>
                                                <th>Batch</th>
                                                <th>Expiry</th>
                                                <th>Status</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventory.length === 0 ? (
                                                <tr><td colSpan="11" style={{ textAlign: 'center', color: '#94a3b8', padding: '30px' }}>No inventory items yet. Click "+ Add Medicine" to start.</td></tr>
                                            ) : inventory.map(item => {
                                                const margin = item.sellingPrice - item.buyingPrice;
                                                const marginPct = item.buyingPrice ? ((margin / item.buyingPrice) * 100).toFixed(1) : '0';
                                                const isExpired = new Date(item.expiryDate) < new Date();
                                                const isExpiringSoon = !isExpired && new Date(item.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                                                return (
                                                    <tr key={item._id} style={isExpired ? { background: '#fef2f2' } : isExpiringSoon ? { background: '#fffbeb' } : {}}>
                                                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                                                        <td style={{ color: '#64748b', fontSize: '13px' }}>{item.salt || '-'}</td>
                                                        <td>{item.category}</td>
                                                        <td><strong>{item.stock}</strong> <span style={{ color: '#94a3b8', fontSize: '11px' }}>{item.unit}</span></td>
                                                        <td>₹{item.buyingPrice}</td>
                                                        <td>₹{item.sellingPrice}</td>
                                                        <td style={{ fontWeight: 600, color: margin >= 0 ? '#059669' : '#dc2626' }}>
                                                            ₹{margin.toFixed(2)} <span style={{ fontSize: '11px', fontWeight: 400 }}>({marginPct}%)</span>
                                                        </td>
                                                        <td style={{ fontSize: '12px', color: '#64748b' }}>{item.batchNumber || '-'}</td>
                                                        <td>
                                                            <span style={{
                                                                fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px',
                                                                background: isExpired ? '#fee2e2' : isExpiringSoon ? '#fef3c7' : '#f1f5f9',
                                                                color: isExpired ? '#b91c1c' : isExpiringSoon ? '#92400e' : '#334155'
                                                            }}>
                                                                {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN') : '-'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                                                                background: item.status === 'In Stock' ? '#dcfce7' : item.status === 'Low Stock' ? '#fef3c7' : '#fee2e2',
                                                                color: item.status === 'In Stock' ? '#166534' : item.status === 'Low Stock' ? '#92400e' : '#b91c1c'
                                                            }}>
                                                                {item.status}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="action-buttons" style={{ gap: '4px' }}>
                                                                <button onClick={() => handleEditInventory(item)} className="btn-edit" style={{ padding: '3px 10px', fontSize: '12px' }}>Edit</button>
                                                                <button onClick={() => handleDeleteInventory(item._id)} className="btn-delete" style={{ padding: '3px 10px', fontSize: '12px' }}>Del</button>
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
                    </div>
                )}

                {/* ===================== LAB PRICING TAB ===================== */}
                {activeTab === 'labpricing' && (
                    <div className="admin-card">
                        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h2>🧪 Lab Tests & Pricing</h2>
                                <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>
                                    Add your own hospital tests or set custom prices for global tests.
                                </p>
                            </div>
                            <button
                                onClick={() => { setShowLabTestForm(v => !v); setError(''); }}
                                className="btn btn-primary"
                                style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                            >
                                {showLabTestForm ? 'Cancel' : '+ Add Lab Test'}
                            </button>
                        </div>

                        {showLabTestForm && (
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
                                <h3 style={{ margin: '0 0 16px', fontSize: '15px', color: '#1e293b' }}>New Hospital-Specific Lab Test</h3>
                                <form onSubmit={handleCreateLabTest} className="user-form">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Test Name *</label>
                                            <input type="text" className="staff-input" placeholder="e.g. Vitamin D3 Test" required
                                                value={labTestForm.name} onChange={e => setLabTestForm(p => ({ ...p, name: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Test Code</label>
                                            <input type="text" className="staff-input" placeholder="e.g. VD3"
                                                value={labTestForm.code} onChange={e => setLabTestForm(p => ({ ...p, code: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Category</label>
                                            <input type="text" className="staff-input" placeholder="e.g. Endocrinology"
                                                value={labTestForm.category} onChange={e => setLabTestForm(p => ({ ...p, category: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Price (₹)</label>
                                            <input type="number" className="staff-input" placeholder="e.g. 800" min="0"
                                                value={labTestForm.price} onChange={e => setLabTestForm(p => ({ ...p, price: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Description</label>
                                        <textarea className="staff-input" rows="2" placeholder="Optional instructions or notes"
                                            value={labTestForm.description} onChange={e => setLabTestForm(p => ({ ...p, description: e.target.value }))} />
                                    </div>
                                    <button type="submit" disabled={savingLabTest} className="submit-button" style={{ maxWidth: '180px' }}>
                                        {savingLabTest ? 'Saving...' : 'Save Lab Test'}
                                    </button>
                                </form>
                            </div>
                        )}

                        {loadingLabTests ? (
                            <div className="loading-message">Loading lab tests...</div>
                        ) : labTests.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                                <p>No lab tests yet. Add your first hospital-specific test above.</p>
                                <button onClick={fetchLabTests} className="btn-edit" style={{ marginTop: '10px', padding: '6px 14px', fontSize: '13px' }}>Reload</button>
                            </div>
                        ) : (
                            <div className="users-table" style={{ overflowX: 'auto' }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Test Name</th>
                                            <th>Code</th>
                                            <th>Category</th>
                                            <th>Base Price (₹)</th>
                                            <th>Your Price (₹)</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {labTests.map(test => (
                                            <tr key={test._id} style={{ background: test.isOwnTest ? '#f0fdf4' : 'white' }}>
                                                <td style={{ fontWeight: 600 }}>
                                                    {test.name}
                                                    {test.isOwnTest && (
                                                        <span style={{ marginLeft: '6px', fontSize: '10px', background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '10px', fontWeight: 700 }}>
                                                            Your Hospital
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ color: '#64748b' }}>{test.code || '-'}</td>
                                                <td>{test.category}</td>
                                                <td>₹{test.price}</td>
                                                <td>
                                                    {test.isOwnTest ? (
                                                        <span style={{ fontSize: '13px', color: '#64748b' }}>— (your test)</span>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ color: '#64748b' }}>₹</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                className="staff-input"
                                                                style={{ width: '110px', padding: '6px 10px' }}
                                                                placeholder={String(test.price)}
                                                                value={labPriceInputs[test._id] || ''}
                                                                onChange={e => setLabPriceInputs(prev => ({ ...prev, [test._id]: e.target.value }))}
                                                            />
                                                            {test.hospitalPrice !== null && (
                                                                <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Custom</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="action-buttons" style={{ gap: '6px' }}>
                                                        {test.isOwnTest ? (
                                                            <button
                                                                onClick={() => handleDeleteLabTest(test._id)}
                                                                className="btn-delete"
                                                                style={{ padding: '5px 12px', fontSize: '12px' }}
                                                            >
                                                                Delete
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleSaveLabPrice(test._id)}
                                                                disabled={savingLabPrice === test._id}
                                                                className="btn-save"
                                                                style={{ padding: '5px 14px', fontSize: '12px' }}
                                                            >
                                                                {savingLabPrice === test._id ? '...' : 'Set Price'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* EDIT USER MODAL */}
                {editModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{ maxWidth: '600px' }}>
                            <h3>Edit Staff Details</h3>
                            <form onSubmit={handleUpdateUser} className="user-form">
                                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px' }}>
                                    <div>
                                        {editForm.newAvatarFile ? (
                                            <img src={URL.createObjectURL(editForm.newAvatarFile)} alt="Preview" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : editForm.currentAvatar ? (
                                            <img src={editForm.currentAvatar} alt="Current" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#cbd5e1' }}></div>
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="staff-label">Change Photo</label>
                                        <input type="file" accept="image/*" onChange={e => setEditForm({ ...editForm, newAvatarFile: e.target.files[0] })} className="staff-input" style={{ padding: '8px' }} />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Name</label>
                                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Email</label>
                                        <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required className="staff-input" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Phone</label>
                                        <input type="text" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Role</label>
                                        <select value={editForm.roleId} onChange={e => setEditForm({ ...editForm, roleId: e.target.value })} required className="staff-input">
                                            {roles.map(role => (
                                                <option key={role._id} value={role._id}>{role.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {hospitalInfo && hospitalInfo.departments && hospitalInfo.departments.length > 0 && (
                                    <div className="form-row" style={{ marginTop: '10px' }}>
                                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                            <label className="staff-label">Assign Department (Optional - Leave blank to allow all)</label>
                                            <select
                                                value={editForm.department}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                                                className="staff-input"
                                                style={{ marginTop: '8px' }}
                                            >
                                                <option value="">-- Select Department --</option>
                                                {hospitalInfo.departments.map(dept => (
                                                    <option key={dept} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div className="modal-buttons" style={{ marginTop: '20px' }}>
                                    <button type="submit" disabled={updating} className="btn-save">{updating ? 'Saving...' : 'Save Changes'}</button>
                                    <button type="button" onClick={() => setEditModal(false)} className="btn-cancel">Cancel</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Delete User Confirm */}
                {deleteConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Confirm Delete</h3>
                            <p>Are you sure you want to delete this user?</p>
                            <div className="modal-buttons">
                                <button onClick={() => handleDeleteUser(deleteConfirm)} className="btn-confirm-delete">Delete</button>
                                <button onClick={() => setDeleteConfirm(null)} className="btn-cancel">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HospitalAdminDashboard;
