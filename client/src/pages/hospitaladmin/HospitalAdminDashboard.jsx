import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '../../store/hooks';
import { updateUser as updateUserAction } from '../../store/slices/authSlice';
import { adminAPI, uploadAPI, hospitalAPI } from '../../utils/api';
import BedManagement from './BedManagement';
import OTDashboard from './OTDashboard';
import '../administration/SuperAdmin.css';
import '../centraladmin/CentralAdminDashboard.css';
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
    const [chartRange, setChartRange] = useState('this_month');
    const [appliedCustomAnim, setAppliedCustomAnim] = useState(false);

    // --- Accounts State ---
    const [accountsSubTab, setAccountsSubTab] = useState('upi');
    const [deptUpis, setDeptUpis] = useState([]);
    const [upiStaffOptions, setUpiStaffOptions] = useState([]);
    const [newDeptUpi, setNewDeptUpi] = useState({ staffUserId: '', upiId: '', label: '' });
    const [loadingDeptUpis, setLoadingDeptUpis] = useState(false);
    const [savingDeptUpi, setSavingDeptUpi] = useState(false);

    // --- Inventory State ---
    const [inventory, setInventory] = useState([]);
    const [loadingInventory, setLoadingInventory] = useState(false);
    const [showInventoryForm, setShowInventoryForm] = useState(false);
    const [editingInventoryId, setEditingInventoryId] = useState(null);
    const defaultInventoryForm = {
        name: '', salt: '', category: 'General', stock: '', unit: 'Tablets', vendor: '', batchNumber: '', expiryDate: '', buyingPrice: '', sellingPrice: '',
        unitConfig: { purchaseUnit: 'Box', saleUnit: 'Strip', baseUnit: 'Tablet', purchaseToSaleMultiplier: 10, saleToBaseMultiplier: 10 },
        inventoryConfig: { openingStock: 0, minStock: 0, maxStock: 0, reorderLevel: 0, warehouse: 'Main Store', rackNumber: '', shelfNumber: '' },
        pricingConfig: { purchasePrice: 0, landingCost: 0, mrp: 0, sellingPrice: 0, maxDiscount: 0, taxType: 'Inclusive' }
    };
    const [inventoryForm, setInventoryForm] = useState(defaultInventoryForm);
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
        const initDashboard = async () => {
            try {
                await Promise.all([
                    fetchMyHospital(),
                    fetchUsers(),
                    fetchRoles()
                ]);
            } catch (err) {
                console.error('Failed to initialize dashboard:', err);
            }
        };
        initDashboard();
    }, []);

    // Fetch data when switching to inventory or lab pricing tabs
    useEffect(() => {
        if (activeTab === 'inventory' && inventory.length === 0) fetchInventory();
        if (activeTab === 'labpricing' && labTests.length === 0) fetchLabTests();
        if (activeTab === 'accounts' && deptUpis.length === 0) fetchDepartmentUpis();
    }, [activeTab]);

    const fetchDepartmentUpis = async () => {
        try {
            setLoadingDeptUpis(true);
            const [upiRes, staffRes] = await Promise.all([
                hospitalAPI.getDepartmentUpis(),
                hospitalAPI.getStaffForUpi()
            ]);
            if (upiRes.success) setDeptUpis(upiRes.departmentUpis);
            if (staffRes.success) setUpiStaffOptions(staffRes.staff.filter(s => !s.hasUpiAssigned));
        } catch (err) { console.error('Failed to fetch department UPIs', err); }
        finally { setLoadingDeptUpis(false); }
    };

    const handleAddDeptUpi = async (e) => {
        e.preventDefault();
        setSavingDeptUpi(true);
        try {
            const res = await hospitalAPI.createDepartmentUpi(newDeptUpi);
            if (res.success) {
                setNewDeptUpi({ staffUserId: '', upiId: '', label: '' });
                fetchDepartmentUpis(); // refresh lists
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to add Department UPI');
        } finally {
            setSavingDeptUpi(false);
        }
    };

    const handleDeleteDeptUpi = async (id) => {
        if (!window.confirm('Are you sure you want to delete this UPI account?')) return;
        try {
            const res = await hospitalAPI.deleteDepartmentUpi(id);
            if (res.success) {
                fetchDepartmentUpis(); // refresh lists
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete Department UPI');
        }
    };
    
    const handleToggleDeptUpi = async (upiDoc) => {
        try {
            const res = await hospitalAPI.updateDepartmentUpi(upiDoc._id, { isActive: !upiDoc.isActive });
            if (res.success) {
                fetchDepartmentUpis();
            }
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to update status');
        }
    };

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

        if (createForm.phone && createForm.phone.length !== 10) {
            setError('Mobile number must be exactly 10 digits.');
            setCreating(false);
            return;
        }

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

        if (editForm.phone && editForm.phone.length !== 10) {
            setError('Mobile number must be exactly 10 digits.');
            setUpdating(false);
            return;
        }

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
        setInventoryForm(defaultInventoryForm);
        setEditingInventoryId(null);
        setShowInventoryForm(false);
    };

    const handleInventorySubmit = async (e) => {
        e.preventDefault();
        setSavingInventory(true); setError(''); setSuccess('');
        try {
            const p2s = inventoryForm.unitConfig?.purchaseToSaleMultiplier || 1;
            const s2b = inventoryForm.unitConfig?.saleToBaseMultiplier || 1;
            const opStock = inventoryForm.inventoryConfig?.openingStock || 0;
            const calculatedStock = opStock * p2s * s2b;

            const data = { 
                ...inventoryForm, 
                stock: calculatedStock, 
                buyingPrice: Number(inventoryForm.pricingConfig?.purchasePrice || 0), 
                sellingPrice: Number(inventoryForm.pricingConfig?.sellingPrice || 0) 
            };

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
            expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
            unitConfig: item.unitConfig || defaultInventoryForm.unitConfig,
            inventoryConfig: item.inventoryConfig || defaultInventoryForm.inventoryConfig,
            pricingConfig: item.pricingConfig || defaultInventoryForm.pricingConfig
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

    const formatCurrency = (amount) => {
        const val = Number(amount) || 0;
        if (val >= 10000000) {
            return `₹ ${(val / 10000000).toFixed(2)} Cr`;
        }
        if (val >= 100000) {
            return `₹ ${(val / 100000).toFixed(2)} L`;
        }
        return `₹ ${val.toLocaleString('en-IN')}`;
    };

    const u = JSON.parse(localStorage.getItem('user') || '{}');
    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'staff', label: 'Staff' },
        { id: 'departments', label: 'Departments' },
        { id: 'facilities', label: 'Facilities' },
        { id: 'beds', label: 'Beds' },
        { id: 'labpricing', label: 'Lab Pricing' },
        { id: 'accounts', label: 'Accounts' },
    ];

    return (
        <div className="hospitaladmin-page">
            <div className="hospitaladmin-container">
                {/* 1. AI-Powered Hero Header Banner (Matching Image 1) */}
                <div className="ha-ai-hero-banner">
                    {/* Circuit / Neural Network Background overlay */}
                    <div className="ha-ai-circuit-bg" />

                    <div className="ha-ai-hero-left">
                        <div className="ha-ai-powered-pill">
                            <span className="ha-ai-chip-icon">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="4" y="4" width="16" height="16" rx="2" />
                                    <rect x="9" y="9" width="6" height="6" />
                                    <line x1="9" y1="1" x2="9" y2="4" />
                                    <line x1="15" y1="1" x2="15" y2="4" />
                                    <line x1="9" y1="20" x2="9" y2="23" />
                                    <line x1="15" y1="20" x2="15" y2="23" />
                                    <line x1="20" y1="9" x2="23" y2="9" />
                                    <line x1="20" y1="14" x2="23" y2="14" />
                                    <line x1="1" y1="9" x2="4" y2="9" />
                                    <line x1="1" y1="14" x2="4" y2="14" />
                                </svg>
                            </span>
                            <span>AI POWERED</span>
                        </div>
                        <h1 className="ha-ai-hero-title">Hospital Administration Dashboard</h1>
                        <p className="ha-ai-hero-subtitle">
                            Manage staff, departments, and hospital operations with AI intelligence.
                        </p>
                    </div>

                    {/* Right: High-Definition Realistic Modern Hospital Campus Visual */}
                    <div className="ha-ai-right-building">
                        <img 
                            src="/assets/realistic_hospital_banner_art.png" 
                            alt="Realistic Modern Hospital Campus" 
                            className="ha-ai-hospital-img" 
                        />
                    </div>
                </div>

                {error && <div className="error-message">⚠️ {error}</div>}
                {success && <div className="success-message">✅ {success}</div>}

                {/* 2. Floating Modern Tab Navigation Bar */}
                <div className="ha-ai-tabs-card">
                    {tabs.filter(t => t.id !== 'accounts').map(tab => {
                        const isTabActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                className={`ha-ai-tab-btn tab-${tab.id} ${isTabActive ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <div className="ha-ai-tab-icon-wrap">
                                    <div className="ha-tab-icon-glow" />
                                    {tab.id === 'overview' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                            <path d="M7 16v-4 M12 16v-7 M17 16v-2" />
                                        </svg>
                                    )}
                                    {tab.id === 'staff' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                    )}
                                    {tab.id === 'departments' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="4" y="2" width="16" height="20" rx="2" />
                                            <path d="M9 22v-4h6v4 M8 6h.01 M16 6h.01 M8 10h.01 M16 10h.01 M8 14h.01 M16 14h.01" />
                                        </svg>
                                    )}
                                    {tab.id === 'facilities' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                            <path d="M12 11v6 M9 14h6" />
                                        </svg>
                                    )}
                                    {tab.id === 'beds' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9" />
                                        </svg>
                                    )}
                                    {tab.id === 'ot' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m14.5 12.5-8 8a2.12 2.12 0 1 1-3-3l8-8" />
                                            <path d="m16 10 4-4a2.83 2.83 0 0 0-4-4l-4 4" />
                                            <path d="m17 7 1 1" />
                                        </svg>
                                    )}
                                    {tab.id === 'inventory' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                                            <path d="m3.3 7 8.7 5 8.7-5 M12 22V12" />
                                        </svg>
                                    )}
                                    {tab.id === 'labpricing' && (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M10 2v7.31L4.89 20A2 2 0 0 0 6.64 23h10.72a2 2 0 0 0 1.75-3L14 9.31V2" />
                                            <path d="M8.5 2h7 M14 9.3h-4 M7 18h10" />
                                        </svg>
                                    )}
                                </div>
                                <span className="ha-ai-tab-label">{tab.label}</span>
                                {isTabActive && (
                                    <div className="ha-active-neon-slider">
                                        <span className="ha-active-spark" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                    <button
                        className={`ha-ai-tab-btn tab-accounts ${activeTab === 'accounts' ? 'active' : ''}`}
                        onClick={() => setActiveTab('accounts')}
                    >
                        <div className="ha-ai-tab-icon-wrap">
                            <div className="ha-tab-icon-glow" />
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="21" x2="21" y2="21" />
                                <line x1="6" y1="18" x2="6" y2="11" />
                                <line x1="10" y1="18" x2="10" y2="11" />
                                <line x1="14" y1="18" x2="14" y2="11" />
                                <line x1="18" y1="18" x2="18" y2="11" />
                                <polygon points="12 2 20 7 4 7" />
                            </svg>
                        </div>
                        <span className="ha-ai-tab-label">Accounts</span>
                        {activeTab === 'accounts' && (
                            <div className="ha-active-neon-slider">
                                <span className="ha-active-spark" />
                            </div>
                        )}
                    </button>
                </div>

                {/* ===================== OVERVIEW TAB ===================== */}
                {activeTab === 'overview' && (() => {
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const now = new Date();
                    const curM = monthNames[now.getMonth()];
                    const prevM = monthNames[(now.getMonth() - 1 + 12) % 12];
                    const dateLabels = chartRange === 'last_month' 
                        ? [`01 ${prevM}`, `05 ${prevM}`, `10 ${prevM}`, `15 ${prevM}`, `20 ${prevM}`, `25 ${prevM}`, `30 ${prevM}`]
                        : chartRange === 'this_year'
                            ? ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov', 'Dec']
                            : [`01 ${curM}`, `05 ${curM}`, `10 ${curM}`, `15 ${curM}`, `20 ${curM}`, `25 ${curM}`, `30 ${curM}`];

                    return (
                        <>
                            {/* Analytics Timeframe Bar */}
                            <div className="ha-ai-timeframe-bar">
                                <div className="ha-ai-timeframe-title">
                                    <span className="ha-ai-timeframe-icon">📈</span>
                                    <span>Analytics Timeframe</span>
                                </div>

                                <div className="ha-ai-timeframe-controls">
                                    <div className="ha-ai-custom-date-inputs">
                                        <input 
                                            className="ha-ai-date-picker" 
                                            type="date" 
                                            value={customStartDate} 
                                            onChange={(e) => { setDatePreset('custom'); setCustomStartDate(e.target.value); }} 
                                        />
                                        <span className="ha-ai-to-label">to</span>
                                        <input 
                                            className="ha-ai-date-picker" 
                                            type="date" 
                                            value={customEndDate} 
                                            onChange={(e) => { setDatePreset('custom'); setCustomEndDate(e.target.value); }} 
                                        />
                                        <button 
                                            className="ha-ai-apply-btn" 
                                            onClick={() => {
                                                handleApplyCustomDate();
                                                setAppliedCustomAnim(true);
                                                setTimeout(() => setAppliedCustomAnim(false), 900);
                                            }}
                                        >
                                            {appliedCustomAnim ? '✓ Applied' : 'Apply Custom'}
                                        </button>
                                    </div>

                                    <div className="ha-ai-preset-pills">
                                        <button 
                                            className={`ha-ai-preset-btn ${datePreset === 'all' ? 'active' : ''}`} 
                                            onClick={() => handleDatePresetChange('all')}
                                        >
                                            All Time
                                        </button>
                                        <button 
                                            className={`ha-ai-preset-btn ${datePreset === 'today' ? 'active' : ''}`} 
                                            onClick={() => handleDatePresetChange('today')}
                                        >
                                            Today
                                        </button>
                                        <button 
                                            className={`ha-ai-preset-btn ${datePreset === '30' ? 'active' : ''}`} 
                                            onClick={() => handleDatePresetChange('30')}
                                        >
                                            30 Days
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 5 KPI Metric Cards Row */}
                            <div className="ha-ai-kpis-grid">
                                {/* 1. Total Patients */}
                                <div className="ha-ai-kpi-card card-patients">
                                    <div className="ha-ai-kpi-header">
                                        <div className="ha-ai-kpi-icon-box icon-patients">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                            </svg>
                                        </div>
                                        <div className="ha-ai-kpi-meta">
                                            <span className="ha-ai-kpi-label">Total Patients</span>
                                            <h3 className="ha-ai-kpi-val">
                                                {(hospitalStats?.stats?.totalPatients ?? stats.totalPatients ?? 0).toLocaleString()}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="ha-ai-kpi-footer">
                                        <span className="ha-ai-kpi-trend trend-up">● Active Patients</span>
                                        <svg className="ha-ai-kpi-sparkline" viewBox="0 0 80 25" fill="none">
                                            <path d="M 2 20 Q 20 15 40 18 T 78 5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>

                                {/* 2. Total Doctors */}
                                <div className="ha-ai-kpi-card card-doctors">
                                    <div className="ha-ai-kpi-header">
                                        <div className="ha-ai-kpi-icon-box icon-doctors">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="7" r="4" />
                                                <path d="M5.5 21a8.5 8.5 0 0 1 13 0" />
                                                <path d="M16 11h3a2 2 0 0 1 2 2v2a3 3 0 0 1-3 3h-1" />
                                            </svg>
                                        </div>
                                        <div className="ha-ai-kpi-meta">
                                            <span className="ha-ai-kpi-label">Total Doctors</span>
                                            <h3 className="ha-ai-kpi-val">
                                                {hospitalStats?.stats?.totalDoctors ?? hospitalStats?.stats?.doctorCount ?? stats.totalDoctors ?? 0}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="ha-ai-kpi-footer">
                                        <span className="ha-ai-kpi-trend trend-up">● Hospital Doctors</span>
                                        <svg className="ha-ai-kpi-sparkline" viewBox="0 0 80 25" fill="none">
                                            <path d="M 2 22 Q 25 10 50 16 T 78 4" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>

                                {/* 3. Total Appointments */}
                                <div className="ha-ai-kpi-card card-appointments">
                                    <div className="ha-ai-kpi-header">
                                        <div className="ha-ai-kpi-icon-box icon-appointments">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                                <line x1="16" y1="2" x2="16" y2="6" />
                                                <line x1="8" y1="2" x2="8" y2="6" />
                                                <line x1="3" y1="10" x2="21" y2="10" />
                                            </svg>
                                        </div>
                                        <div className="ha-ai-kpi-meta">
                                            <span className="ha-ai-kpi-label">Total Appointments</span>
                                            <h3 className="ha-ai-kpi-val">
                                                {(hospitalStats?.stats?.totalAppointments ?? 0).toLocaleString()}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="ha-ai-kpi-footer">
                                        <span className="ha-ai-kpi-trend trend-up">● Booked Records</span>
                                        <svg className="ha-ai-kpi-sparkline" viewBox="0 0 80 25" fill="none">
                                            <path d="M 2 20 Q 20 18 45 8 T 78 4" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>

                                {/* 4. Total Revenue */}
                                <div className="ha-ai-kpi-card card-revenue">
                                    <div className="ha-ai-kpi-header">
                                        <div className="ha-ai-kpi-icon-box icon-revenue">
                                            <span style={{ fontSize: '18px', fontWeight: 900, color: '#ea580c' }}>₹</span>
                                        </div>
                                        <div className="ha-ai-kpi-meta">
                                            <span className="ha-ai-kpi-label">Total Revenue</span>
                                            <h3 className="ha-ai-kpi-val">
                                                {formatCurrency(hospitalStats?.stats?.totalRevenue ?? 0)}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="ha-ai-kpi-footer">
                                        <span className="ha-ai-kpi-trend trend-up">● Billed Invoices</span>
                                        <svg className="ha-ai-kpi-sparkline" viewBox="0 0 80 25" fill="none">
                                            <path d="M 2 22 Q 22 18 45 12 T 78 3" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>

                                {/* 5. Occupancy Rate */}
                                <div className="ha-ai-kpi-card card-occupancy">
                                    <div className="ha-ai-kpi-header">
                                        <div className="ha-ai-kpi-icon-box icon-occupancy">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9" />
                                            </svg>
                                        </div>
                                        <div className="ha-ai-kpi-meta">
                                            <span className="ha-ai-kpi-label">Occupancy Rate</span>
                                            <h3 className="ha-ai-kpi-val">
                                                {`${hospitalStats?.stats?.occupancyRate ?? 0}%`}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="ha-ai-kpi-footer">
                                        <span className="ha-ai-kpi-trend trend-up">● Bed Utilization</span>
                                        <svg className="ha-ai-kpi-sparkline" viewBox="0 0 80 25" fill="none">
                                            <path d="M 2 18 Q 25 22 50 10 T 78 6" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>
                            </div>


                            {/* Bottom Panels (Appointments Overview & Quick Summary) */}
                            <section className="bottom">
                                {/* Appointment Chart Panel */}
                                <div className="panel">
                                    <div className="panel-head">
                                        <div className="panel-title">
                                            <div className="mini">▦</div>
                                            Appointments Overview
                                        </div>
                                        <select value={chartRange} onChange={e => setChartRange(e.target.value)}>
                                            <option value="this_month">This Month</option>
                                            <option value="last_month">Last Month</option>
                                            <option value="this_year">This Year</option>
                                        </select>
                                    </div>

                                    <div className="chart">
                                        <div className="gridline one"></div>
                                        <div className="gridline two"></div>
                                        <div className="gridline three"></div>
                                        <div className="gridline four"></div>

                                        <svg className="line-svg" viewBox="0 0 800 210" preserveAspectRatio="none">
                                            <defs>
                                                <linearGradient id="areaGradHaOverview" x1="0" x2="0" y1="0" y2="1">
                                                    <stop offset="0%" stopColor="#7560ee" stopOpacity="0.25" />
                                                    <stop offset="100%" stopColor="#7560ee" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            <path
                                                d={
                                                    chartRange === 'last_month'
                                                        ? 'M10,185 C45,150 70,165 95,130 S150,140 180,100 S225,115 250,80 S300,95 330,110 S375,140 405,120 S440,85 465,100 S510,90 540,85 S575,65 605,75 S645,55 675,80 S730,60 790,90 L790,205 L10,205 Z'
                                                        : chartRange === 'this_year'
                                                            ? 'M10,160 C50,140 80,120 120,100 S180,110 220,70 S280,85 320,50 S380,60 420,80 S480,55 520,40 S580,45 620,35 S680,50 720,30 S760,25 790,45 L790,205 L10,205 Z'
                                                            : 'M10,178 C40,135 65,158 90,145 S140,155 170,120 S215,130 240,90 S290,105 320,125 S365,170 395,155 S430,105 455,125 S500,105 530,112 S565,78 595,95 S635,70 665,100 S720,80 790,105 L790,205 L10,205 Z'
                                                }
                                                fill="url(#areaGradHaOverview)"
                                            />
                                            <path
                                                d={
                                                    chartRange === 'last_month'
                                                        ? 'M10,185 C45,150 70,165 95,130 S150,140 180,100 S225,115 250,80 S300,95 330,110 S375,140 405,120 S440,85 465,100 S510,90 540,85 S575,65 605,75 S645,55 675,80 S730,60 790,90'
                                                        : chartRange === 'this_year'
                                                            ? 'M10,160 C50,140 80,120 120,100 S180,110 220,70 S280,85 320,50 S380,60 420,80 S480,55 520,40 S580,45 620,35 S680,50 720,30 S760,25 790,45'
                                                            : 'M10,178 C40,135 65,158 90,145 S140,155 170,120 S215,130 240,90 S290,105 320,125 S365,170 395,155 S430,105 455,125 S500,105 530,112 S565,78 595,95 S635,70 665,100 S720,80 790,105'
                                                }
                                                fill="none"
                                                stroke="#7658ed"
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        color: '#91a0ad',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        padding: '0 10px 0 35px',
                                    }}>
                                        {dateLabels.map((lbl, i) => (
                                            <span key={i}>{lbl}</span>
                                        ))}
                                    </div>
                                </div>

                                {/* Quick Summary Panel */}
                                <div className="panel">
                                    <div className="panel-title">
                                        <div className="mini">▣</div>
                                        Quick Summary
                                    </div>

                                    <div className="quick-list">
                                        <div className="quick">
                                            <div className="quick-icon">✓</div>
                                            <div className="quick-text">
                                                <b>Completed</b>
                                                <span>Completed appointments</span>
                                            </div>
                                            <strong>{hospitalStats?.stats?.completedAppointments ?? 0}</strong>
                                        </div>

                                        <div className="quick">
                                            <div className="quick-icon">◷</div>
                                            <div className="quick-text">
                                                <b>Pending / Upcoming</b>
                                                <span>Upcoming appointments</span>
                                            </div>
                                            <strong>{hospitalStats?.stats?.pendingAppointments ?? 0}</strong>
                                        </div>

                                        <div className="quick">
                                            <div className="quick-icon">♜</div>
                                            <div className="quick-text">
                                                <b>Lab Reports</b>
                                                <span>Pending reports</span>
                                            </div>
                                            <strong>{hospitalStats?.stats?.pendingLabReports ?? (hospitalStats?.stats?.labReportCount ?? 0)}</strong>
                                        </div>

                                        <div className="quick">
                                            <div className="quick-icon">▣</div>
                                            <div className="quick-text">
                                                <b>Pharmacy Orders</b>
                                                <span>Pending pharmacy orders</span>
                                            </div>
                                            <strong>{hospitalStats?.stats?.pharmacyOrderCount ?? 0}</strong>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* 1. Modern Glassmorphic "My Profile" Card (Matching Image 2) */}
                            <div className="ha-profile-modern-card">
                                <div className="ha-profile-header">
                                    <div className="ha-card-title-badge">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                            <circle cx="12" cy="7" r="4" />
                                        </svg>
                                    </div>
                                    <div className="ha-card-title-wrap">
                                        <h3 className="ha-card-title">My Profile</h3>
                                        <div className="ha-title-underline" />
                                    </div>
                                </div>

                                <div className="ha-profile-body">
                                    {/* Left: Avatar with Double Glow Rings & Edit Pencil Badge */}
                                    <div className="ha-avatar-glow-ring">
                                        <div className="ha-avatar-container">
                                            {profileFile ? (
                                                <img src={URL.createObjectURL(profileFile)} alt="Preview" className="ha-avatar-img" />
                                            ) : currentUser?.avatar ? (
                                                <img src={currentUser.avatar} alt={currentUser.name} className="ha-avatar-img" />
                                            ) : (
                                                <div className="ha-avatar-initials">
                                                    {(currentUser?.name || 'K').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            {/* Edit Pencil Badge */}
                                            <button 
                                                type="button" 
                                                className="ha-avatar-edit-badge" 
                                                title="Change Photo"
                                                onClick={() => document.getElementById('profilePhotoInput')?.click()}
                                            >
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 20h9" />
                                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Middle: User Info & Actions */}
                                    <div className="ha-profile-info-block">
                                        <h4 className="ha-profile-name">{currentUser?.name || 'Hospital Admin'}</h4>
                                        <p className="ha-profile-email">{currentUser?.email || ''}</p>
                                        
                                        <div className="ha-profile-actions">
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                id="profilePhotoInput" 
                                                style={{ display: 'none' }}
                                                onChange={e => setProfileFile(e.target.files[0])} 
                                            />
                                            <label htmlFor="profilePhotoInput" className="ha-choose-photo-btn">
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                                    <circle cx="12" cy="13" r="4" />
                                                </svg>
                                                <span>Choose Photo</span>
                                            </label>
                                            
                                            {profileFile && (
                                                <button onClick={handleSaveProfilePhoto} disabled={savingProfile} className="ha-save-photo-btn">
                                                    {savingProfile ? 'Saving...' : 'Save Photo'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: 3D Holographic AI Security Shield & Floating Orbs */}
                                    <div className="ha-profile-hologram-wrap">
                                        <svg className="ha-hologram-svg" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.8" />
                                                    <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.2" />
                                                </linearGradient>
                                                <linearGradient id="userGlowGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#0ea5e9" />
                                                    <stop offset="100%" stopColor="#3b82f6" />
                                                </linearGradient>
                                            </defs>
                                            
                                            {/* Planetary Orbit Rings */}
                                            <ellipse cx="140" cy="90" rx="105" ry="42" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3 4" transform="rotate(-15 140 90)" opacity="0.6" />
                                            <ellipse cx="140" cy="90" rx="95" ry="36" stroke="#60a5fa" strokeWidth="1.2" transform="rotate(25 140 90)" opacity="0.5" />
                                            <circle cx="140" cy="90" r="70" fill="none" stroke="#e0f2fe" strokeWidth="1" opacity="0.4" />
                                            
                                            {/* Central Security Shield */}
                                            <path d="M 140 32 C 168 32 186 44 192 62 C 192 108 158 140 140 152 C 122 140 88 108 88 62 C 94 44 112 32 140 32 Z" 
                                                fill="url(#shieldGrad)" stroke="#38bdf8" strokeWidth="1.8" strokeLinejoin="round" />
                                            
                                            {/* User Silhouette Inside Shield */}
                                            <circle cx="140" cy="74" r="16" stroke="url(#userGlowGrad)" strokeWidth="3" fill="none" />
                                            <path d="M 118 122 C 118 104 128 98 140 98 C 152 98 162 104 162 122" stroke="url(#userGlowGrad)" strokeWidth="3" strokeLinecap="round" fill="none" />
                                            
                                            {/* Floating Micro Orbs */}
                                            {/* Heartbeat Orb */}
                                            <g transform="translate(68, 38)">
                                                <circle cx="14" cy="14" r="14" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.2" />
                                                <path d="M 8 15 L 11 15 L 13 11 L 15 18 L 17 13 L 19 15 L 21 15" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </g>
                                            
                                            {/* Users Group Orb */}
                                            <g transform="translate(208, 118)">
                                                <circle cx="14" cy="14" r="14" fill="#ecfeff" stroke="#a5f3fc" strokeWidth="1.2" />
                                                <path d="M 11 12 A 3 3 0 1 0 11 6 A 3 3 0 1 0 11 12 Z M 17 11 A 2.5 2.5 0 1 0 17 6 M 6 20 C 6 17 8.5 15 11 15 C 13.5 15 16 17 16 20 M 16 15 C 18 15 21 16.5 21 19" 
                                                    stroke="#0891b2" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                                            </g>
                                            
                                            {/* Particle Sparkles */}
                                            <circle cx="64" cy="132" r="3" fill="#38bdf8" />
                                            <circle cx="218" cy="46" r="2.5" fill="#60a5fa" />
                                            <path d="M 52 74 L 56 74 M 54 72 L 54 76" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" />
                                            <path d="M 235 94 L 239 94 M 237 92 L 237 96" stroke="#93c5fd" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Modern Glassmorphic "My Hospital" Card (Matching Image 2) */}
                            {hospitalInfo && (
                                <div className="ha-hospital-modern-card">
                                    <div className="ha-hospital-header">
                                        <div className="ha-card-title-badge">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M3 21h18" />
                                                <path d="M5 21V7l8-4v18" />
                                                <path d="M19 21V11l-6-3" />
                                                <path d="M9 9h1" />
                                                <path d="M9 13h1" />
                                                <path d="M9 17h1" />
                                            </svg>
                                        </div>
                                        <div className="ha-card-title-wrap">
                                            <h3 className="ha-card-title">My Hospital</h3>
                                            <div className="ha-title-underline" />
                                        </div>
                                    </div>

                                    {/* 4-Column Structured Glass Pill Bar */}
                                    <div className="ha-hospital-pill-grid">
                                        {/* Column 1: Hospital Name */}
                                        <div className="ha-hospital-pill-col">
                                            <div className="ha-hospital-icon-badge badge-hospital">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 21h18" />
                                                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                                                    <line x1="12" y1="7" x2="12" y2="13" />
                                                    <line x1="9" y1="10" x2="15" y2="10" />
                                                </svg>
                                            </div>
                                            <div className="ha-hospital-pill-info">
                                                <span className="ha-hospital-pill-label">Name</span>
                                                <span className="ha-hospital-pill-value">{hospitalInfo.name || '—'}</span>
                                            </div>
                                        </div>

                                        {/* Column 2: City / Location */}
                                        <div className="ha-hospital-pill-col">
                                            <div className="ha-hospital-icon-badge badge-city">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                                    <circle cx="12" cy="10" r="3" />
                                                </svg>
                                            </div>
                                            <div className="ha-hospital-pill-info">
                                                <span className="ha-hospital-pill-label">City</span>
                                                <span className="ha-hospital-pill-value">
                                                    {hospitalInfo.city ? `${hospitalInfo.city}${hospitalInfo.state ? `, ${hospitalInfo.state}` : ''}` : (hospitalInfo.address || '—')}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Column 3: Phone */}
                                        <div className="ha-hospital-pill-col">
                                            <div className="ha-hospital-icon-badge badge-phone">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                                </svg>
                                            </div>
                                            <div className="ha-hospital-pill-info">
                                                <span className="ha-hospital-pill-label">Phone</span>
                                                <span className="ha-hospital-pill-value">{hospitalInfo.phone || '—'}</span>
                                            </div>
                                        </div>

                                        {/* Column 4: Email */}
                                        <div className="ha-hospital-pill-col">
                                            <div className="ha-hospital-icon-badge badge-email">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                                    <polyline points="22,6 12,13 2,6" />
                                                </svg>
                                            </div>
                                            <div className="ha-hospital-pill-info">
                                                <span className="ha-hospital-pill-label">Email</span>
                                                <span className="ha-hospital-pill-value">{hospitalInfo.email || '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}

                {/* ===================== STAFF TAB ===================== */}
                {activeTab === 'staff' && (
                    <div>
                        {/* Staff Management Quick Actions */}
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <h2 style={{ marginBottom: '12px' }}>⚡ Staff Management</h2>
                            <p style={{ color: '#888', fontSize: '14px', margin: '0 0 16px' }}>Manage your hospital's staff and doctors from here.</p>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => navigate('/admin/doctors')}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-semibold text-sm hover:bg-blue-100"
                                >
                                    👨‍⚕️ Manage Doctors
                                </button>
                                {!['enterprise', 'clinic_basic', 'multi_speciality_starter'].includes(currentUser?.subscriptionPlan) && (
                                    <button
                                        onClick={() => navigate('/admin/roles')}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg font-semibold text-sm hover:bg-purple-100"
                                    >
                                        🔑 Manage Roles
                                    </button>
                                )}
                            </div>
                        </div>


                        {/* Users Table */}
                        <div className="admin-card">
                            <h2>All Staff & Doctors</h2>
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
                                                            <div className="flex flex-col sm:flex-row gap-2">
                                                                {!isCurrentUser && !isSuperUser && (
                                                                    <>
                                                                        <button onClick={() => openEditModal(userItem)} className="btn-edit text-xs">Edit</button>
                                                                        <button onClick={() => setDeleteConfirm(userItem.id || userItem._id)} className="btn-delete text-xs">Delete</button>
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
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                            <div>
                                <h2>💵 Department Consultation Fees</h2>
                                <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>
                                    Configure the consultation fee for each department. Receptionists cannot alter these fees during booking.
                                </p>
                            </div>
                            <button
                                className="btn-save w-full sm:w-auto"
                                style={{ padding: '8px 20px', whiteSpace: 'nowrap' }}
                                onClick={async () => {
                                    try {
                                        setError('');
                                        await hospitalAPI.updateDepartmentFees({ 
                                            departmentFees: hospitalInfo.departmentFees,
                                            departmentValidity: hospitalInfo.departmentValidity 
                                        });
                                        setSuccess('All department fees and validity saved!');
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
                                        <th>Consultation Validity (Days)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(hospitalInfo?.departments || []).length === 0 ? (
                                        <tr><td colSpan="3" style={{ textAlign: 'center', color: '#666' }}>No departments assigned yet. Contact Central Admin.</td></tr>
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
                                                            value={hospitalInfo?.departmentFees?.[dept] ?? 500}
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
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            className="staff-input"
                                                            style={{ width: '140px', padding: '8px 12px' }}
                                                            value={hospitalInfo?.departmentValidity?.[dept] ?? 5}
                                                            onChange={(e) => {
                                                                const newValidity = Number(e.target.value);
                                                                setHospitalInfo(prev => ({
                                                                    ...prev,
                                                                    departmentValidity: { ...(prev.departmentValidity || {}), [dept]: newValidity }
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

                {/* ===================== BEDS TAB ===================== */}
                {activeTab === 'beds' && (
                    <BedManagement />
                )}

                {/* ===================== OPERATION THEATRE TAB ===================== */}
                {activeTab === 'ot' && (
                    <OTDashboard />
                )}

                {/* ===================== INVENTORY TAB ===================== */}
                {activeTab === 'inventory' && (
                    <div>
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                <div>
                                    <h2>💊 Medicine Inventory</h2>
                                    <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>Manage your hospital's medicine stock, pricing, and expiry tracking</p>
                                </div>
                                <button
                                    onClick={() => { if (showInventoryForm && !editingInventoryId) { resetInventoryForm(); } else { resetInventoryForm(); setShowInventoryForm(true); } }}
                                    className={`${showInventoryForm ? 'btn-cancel' : 'btn-save'} w-full sm:w-auto`}
                                    style={{ padding: '8px 20px' }}
                                >
                                    {showInventoryForm ? 'Cancel' : '+ Add Medicine'}
                                </button>
                            </div>

                            {showInventoryForm && (
                                <form onSubmit={handleInventorySubmit} className="user-form" style={{ padding: '0px', marginBottom: '20px' }}>
                                    
                                    {/* BASIC INFO */}
                                    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{editingInventoryId ? 'Edit Medicine' : 'Add New Medicine'}</h4>
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
                                                <label className="staff-label">Batch Number</label>
                                                <input type="text" className="staff-input" placeholder="e.g. BT-2026-001" value={inventoryForm.batchNumber} onChange={e => setInventoryForm({ ...inventoryForm, batchNumber: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Expiry Date *</label>
                                                <input type="date" className="staff-input" value={inventoryForm.expiryDate} onChange={e => setInventoryForm({ ...inventoryForm, expiryDate: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Vendor / Supplier</label>
                                                <input type="text" className="staff-input" placeholder="e.g. MedSupply Co." value={inventoryForm.vendor} onChange={e => setInventoryForm({ ...inventoryForm, vendor: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* UNIT CONFIGURATION */}
                                    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unit Configuration</h4>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Purchase Unit</label>
                                                <select className="staff-input" value={inventoryForm.unitConfig.purchaseUnit} onChange={e => setInventoryForm({ ...inventoryForm, unitConfig: { ...inventoryForm.unitConfig, purchaseUnit: e.target.value }})}>
                                                    {['Box', 'Carton', 'Pack', 'Bottle'].map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Sale Unit</label>
                                                <select className="staff-input" value={inventoryForm.unitConfig.saleUnit} onChange={e => setInventoryForm({ ...inventoryForm, unitConfig: { ...inventoryForm.unitConfig, saleUnit: e.target.value }})}>
                                                    {['Strip', 'Sheet', 'Vial', 'Piece'].map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Base Unit</label>
                                                <select className="staff-input" value={inventoryForm.unitConfig.baseUnit} onChange={e => setInventoryForm({ ...inventoryForm, unitConfig: { ...inventoryForm.unitConfig, baseUnit: e.target.value }})}>
                                                    {['Tablet', 'Capsule', 'ml', 'mg'].map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ border: '1px dashed #cbd5e1', padding: '16px', borderRadius: '8px', background: '#f8fafc', marginBottom: '16px' }}>
                                            <h5 style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>Conversion Builder</h5>
                                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                    <span style={{ fontSize: '14px', fontWeight: '500' }}>1 {inventoryForm.unitConfig.purchaseUnit} = </span>
                                                    <input type="number" className="staff-input" style={{ width: '80px', padding: '6px' }} min="1" value={inventoryForm.unitConfig.purchaseToSaleMultiplier} onChange={e => setInventoryForm({ ...inventoryForm, unitConfig: { ...inventoryForm.unitConfig, purchaseToSaleMultiplier: Number(e.target.value) }})} />
                                                    <span style={{ fontSize: '14px' }}>{inventoryForm.unitConfig.saleUnit}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                                    <span style={{ fontSize: '14px', fontWeight: '500' }}>1 {inventoryForm.unitConfig.saleUnit} = </span>
                                                    <input type="number" className="staff-input" style={{ width: '80px', padding: '6px' }} min="1" value={inventoryForm.unitConfig.saleToBaseMultiplier} onChange={e => setInventoryForm({ ...inventoryForm, unitConfig: { ...inventoryForm.unitConfig, saleToBaseMultiplier: Number(e.target.value) }})} />
                                                    <span style={{ fontSize: '14px' }}>{inventoryForm.unitConfig.baseUnit}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '16px' }}>💡</span>
                                            <p style={{ margin: 0, fontSize: '13px', color: '#1d4ed8' }}>
                                                <strong>System Intelligence:</strong> Inventory is always maintained in the smallest base unit. System Stock Unit: <strong>{(inventoryForm.unitConfig.purchaseToSaleMultiplier || 1) * (inventoryForm.unitConfig.saleToBaseMultiplier || 1)} {inventoryForm.unitConfig.baseUnit}s</strong> per {inventoryForm.unitConfig.purchaseUnit}.
                                            </p>
                                        </div>
                                    </div>

                                    {/* INVENTORY CONFIGURATION */}
                                    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventory Configuration</h4>
                                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                                            <div className="form-group">
                                                <label className="staff-label">Opening Stock</label>
                                                <input type="number" className="staff-input" value={inventoryForm.inventoryConfig.openingStock} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, openingStock: Number(e.target.value) }})} />
                                                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>In {inventoryForm.unitConfig.purchaseUnit}s</span>
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Min Stock</label>
                                                <input type="number" className="staff-input" value={inventoryForm.inventoryConfig.minStock} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, minStock: Number(e.target.value) }})} />
                                                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>In {inventoryForm.unitConfig.purchaseUnit}s</span>
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Max Stock</label>
                                                <input type="number" className="staff-input" value={inventoryForm.inventoryConfig.maxStock} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, maxStock: Number(e.target.value) }})} />
                                                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>In {inventoryForm.unitConfig.purchaseUnit}s</span>
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Reorder Level</label>
                                                <input type="number" className="staff-input" value={inventoryForm.inventoryConfig.reorderLevel} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, reorderLevel: Number(e.target.value) }})} />
                                                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>In {inventoryForm.unitConfig.purchaseUnit}s</span>
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Warehouse / Store</label>
                                                <select className="staff-input" value={inventoryForm.inventoryConfig.warehouse} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, warehouse: e.target.value }})}>
                                                    {['Main Store', 'Pharmacy Front', 'Cold Storage'].map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Rack Number</label>
                                                <input type="text" className="staff-input" placeholder="e.g. A-12" value={inventoryForm.inventoryConfig.rackNumber} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, rackNumber: e.target.value }})} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Shelf Number</label>
                                                <input type="text" className="staff-input" placeholder="e.g. S-3" value={inventoryForm.inventoryConfig.shelfNumber} onChange={e => setInventoryForm({ ...inventoryForm, inventoryConfig: { ...inventoryForm.inventoryConfig, shelfNumber: e.target.value }})} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* PRICING CONFIGURATION */}
                                    <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing & Margins (Per {inventoryForm.unitConfig.saleUnit})</h4>
                                        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                                            <div className="form-group">
                                                <label className="staff-label">Purchase Price (₹)</label>
                                                <input type="number" className="staff-input" step="0.01" value={inventoryForm.pricingConfig.purchasePrice} onChange={e => setInventoryForm({ ...inventoryForm, pricingConfig: { ...inventoryForm.pricingConfig, purchasePrice: Number(e.target.value) }})} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Landing Cost (₹)</label>
                                                <input type="number" className="staff-input" step="0.01" value={inventoryForm.pricingConfig.landingCost} onChange={e => setInventoryForm({ ...inventoryForm, pricingConfig: { ...inventoryForm.pricingConfig, landingCost: Number(e.target.value) }})} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">MRP (₹)</label>
                                                <input type="number" className="staff-input" step="0.01" value={inventoryForm.pricingConfig.mrp} onChange={e => setInventoryForm({ ...inventoryForm, pricingConfig: { ...inventoryForm.pricingConfig, mrp: Number(e.target.value) }})} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Selling Price (₹)</label>
                                                <input type="number" className="staff-input" step="0.01" value={inventoryForm.pricingConfig.sellingPrice} onChange={e => setInventoryForm({ ...inventoryForm, pricingConfig: { ...inventoryForm.pricingConfig, sellingPrice: Number(e.target.value) }})} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Max Discount (%)</label>
                                                <input type="number" className="staff-input" step="0.1" value={inventoryForm.pricingConfig.maxDiscount} onChange={e => setInventoryForm({ ...inventoryForm, pricingConfig: { ...inventoryForm.pricingConfig, maxDiscount: Number(e.target.value) }})} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Tax Type</label>
                                                <select className="staff-input" value={inventoryForm.pricingConfig.taxType} onChange={e => setInventoryForm({ ...inventoryForm, pricingConfig: { ...inventoryForm.pricingConfig, taxType: e.target.value }})}>
                                                    {['Inclusive', 'Exclusive'].map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label className="staff-label">System Calculated Profit</label>
                                            <input type="text" className="staff-input" readOnly
                                                style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', fontWeight: 700, color: (Number(inventoryForm.pricingConfig.sellingPrice) - Number(inventoryForm.pricingConfig.landingCost)) >= 0 ? '#16a34a' : '#dc2626' }}
                                                value={`₹${(Number(inventoryForm.pricingConfig.sellingPrice || 0) - Number(inventoryForm.pricingConfig.landingCost || 0)).toFixed(2)} (${(Number(inventoryForm.pricingConfig.landingCost || 0) > 0 ? ((Number(inventoryForm.pricingConfig.sellingPrice || 0) - Number(inventoryForm.pricingConfig.landingCost || 0)) / Number(inventoryForm.pricingConfig.landingCost || 1) * 100) : 0).toFixed(1)}%)`}
                                            />
                                        </div>
                                    </div>

                                    <button type="submit" disabled={savingInventory} className="submit-button" style={{ maxWidth: '250px', padding: '12px', fontSize: '16px', fontWeight: 'bold' }}>
                                        {savingInventory ? 'Saving...' : editingInventoryId ? 'Update Medicine' : 'Add Medicine'}
                                    </button>
                                </form>
                            )}
                        </div>

                        {/* Inventory Table */}
                        <div className="admin-card">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                <h2>Current Stock ({inventory.length} items)</h2>
                                {!inventory.length && !loadingInventory && (
                                    <button onClick={fetchInventory} className="btn-edit w-full sm:w-auto" style={{ padding: '6px 14px', fontSize: '13px' }}>Load Inventory</button>
                                )}
                            </div>
                            {loadingInventory ? (
                                <div className="loading-message">Loading inventory...</div>
                            ) : (
                                <div data-lenis-prevent="true" className="users-table" style={{ overflowX: 'auto' }}>
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
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                            <div>
                                <h2>🧪 Lab Tests & Pricing</h2>
                                <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>
                                    Add your own hospital tests or set custom prices for global tests.
                                </p>
                            </div>
                            <button
                                onClick={() => { setShowLabTestForm(v => !v); setError(''); }}
                                className="btn btn-primary w-full sm:w-auto"
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
                            <div data-lenis-prevent="true" className="users-table" style={{ overflowX: 'auto' }}>
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

                {/* ===================== ACCOUNTS TAB ===================== */}
                {activeTab === 'accounts' && (
                    <div className="tab-pane">
                        <div className="section-header" style={{ marginBottom: '20px' }}>
                            <h2>🏦 Accounts & Payments Configuration</h2>
                            <p>Manage payment options, banking integrations, and gateways.</p>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
                            <button onClick={() => setAccountsSubTab('upi')} className={`ha-tab ${accountsSubTab === 'upi' ? 'ha-tab-active' : ''}`}>UPI Settings</button>
                            <button onClick={() => setAccountsSubTab('bank')} className={`ha-tab ${accountsSubTab === 'bank' ? 'ha-tab-active' : ''}`}>Bank Details (Coming Soon)</button>
                            <button onClick={() => setAccountsSubTab('card')} className={`ha-tab ${accountsSubTab === 'card' ? 'ha-tab-active' : ''}`}>Card Payments (Coming Soon)</button>
                        </div>

                        {accountsSubTab === 'upi' && (
                            <div className="admin-card" style={{ padding: '24px' }}>
                                <h3 style={{ marginBottom: '20px', color: '#0f172a' }}>Department UPI Management</h3>
                                
                                <form onSubmit={handleAddDeptUpi} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '30px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 200px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Assign To Staff *</label>
                                        <select 
                                            value={newDeptUpi.staffUserId} 
                                            onChange={(e) => setNewDeptUpi({ ...newDeptUpi, staffUserId: e.target.value })} 
                                            required 
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}
                                        >
                                            <option value="" disabled>-- Select Staff Member --</option>
                                            {upiStaffOptions.map(s => (
                                                <option key={s._id} value={s._id}>{s.name} ({s.roleName})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: '1 1 200px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Account Label / Counter Name *</label>
                                        <input type="text" value={newDeptUpi.label} onChange={(e) => setNewDeptUpi({ ...newDeptUpi, label: e.target.value })} required placeholder="e.g. Reception Desk" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <div style={{ flex: '1 1 200px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>UPI ID *</label>
                                        <input type="text" value={newDeptUpi.upiId} onChange={(e) => setNewDeptUpi({ ...newDeptUpi, upiId: e.target.value })} required placeholder="e.g. counter@upi" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }} />
                                    </div>
                                    <button type="submit" disabled={savingDeptUpi || upiStaffOptions.length === 0} style={{ padding: '10px 20px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', opacity: (savingDeptUpi || upiStaffOptions.length === 0) ? 0.7 : 1 }}>
                                        {savingDeptUpi ? 'Saving...' : '+ Add UPI Account'}
                                    </button>
                                </form>
        
                                <h4 style={{ marginBottom: '15px', color: '#334155' }}>Configured UPI Accounts</h4>
                                {loadingDeptUpis ? (
                                    <p style={{ color: '#64748b' }}>Loading...</p>
                                ) : deptUpis.length === 0 ? (
                                    <p style={{ color: '#64748b' }}>No department UPI accounts configured yet.</p>
                                ) : (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {deptUpis.map((upi) => (
                                            <div key={upi._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1rem' }}>{upi.label}</span>
                                                        <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', background: upi.isActive ? '#dcfce7' : '#f1f5f9', color: upi.isActive ? '#166534' : '#64748b', fontWeight: 600 }}>
                                                            {upi.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
                                                        {upi.upiId} — Assigned to: <strong>{upi.staffUserId?.name || 'Unknown'}</strong> ({upi.staffRoleName})
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button type="button" onClick={() => handleToggleDeptUpi(upi)} style={{ padding: '8px 16px', background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                        {upi.isActive ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    <button type="button" onClick={() => handleDeleteDeptUpi(upi._id)} style={{ padding: '8px 16px', background: '#fee2e2', color: '#ef4444', border: '1px solid #f87171', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {accountsSubTab === 'bank' && (
                            <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🏦</div>
                                <h3>Bank Transfers Integration</h3>
                                <p>This feature is coming soon.</p>
                            </div>
                        )}

                        {accountsSubTab === 'card' && (
                            <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>💳</div>
                                <h3>Card Payment Gateways</h3>
                                <p>This feature is coming soon.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* EDIT USER MODAL */}
                {editModal && (
                    <div className="modal-overlay">
                        <div data-lenis-prevent="true" className="modal-content" style={{ maxWidth: '600px' }}>
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
                                        <label className="staff-label">Name *</label>
                                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required minLength={2} className="staff-input" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Email</label>
                                        <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required className="staff-input" />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="staff-label">Phone *</label>
                                        <input 
                                            type="text" 
                                            placeholder="e.g. 9876543210" 
                                            value={editForm.phone || ''} 
                                            onChange={e => {
                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                setEditForm({ ...editForm, phone: cleanVal });
                                            }} 
                                            required
                                            title="Phone number must be exactly 10 digits"
                                            className="staff-input" 
                                         maxLength="10"  pattern="\d{10}" />
                                    </div>
                                    <div className="form-group">
                                        <label className="staff-label">Role</label>
                                        <select value={editForm.roleId} onChange={e => setEditForm({ ...editForm, roleId: e.target.value })} required disabled className="staff-input">
                                            {roles
                                                .filter(role => !role.name.toLowerCase().includes('clinic'))
                                                .map(role => (
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
                        <div data-lenis-prevent="true" className="modal-content">
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
