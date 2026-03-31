import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI, uploadAPI, hospitalAPI, hospitalAdminAPI, questionLibraryAPI } from '../../utils/api';
import HospitalBrandingEditor from '../../components/HospitalBrandingEditor';
import '../administration/SuperAdmin.css';
import './CentralAdminDashboard.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CentralAdminDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('hospitals');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Hospital list
    const [hospitals, setHospitals] = useState([]);
    const [loadingHospitals, setLoadingHospitals] = useState(false);
    const [showHospitalForm, setShowHospitalForm] = useState(false);
    const [hospitalForm, setHospitalForm] = useState({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', departments: [], appointmentFee: 500 });
    const [editHospital, setEditHospital] = useState(null);
    const [savingHospital, setSavingHospital] = useState(false);
    const [deleteHospitalConfirm, setDeleteHospitalConfirm] = useState(null);
    // Branding Editor
    const [brandingHospital, setBrandingHospital] = useState(null);
    const hospitalFormRef = useRef(null);

    // Hospital Admin creation
    const [showHospitalAdminForm, setShowHospitalAdminForm] = useState(false);
    const [hospitalAdminForm, setHospitalAdminForm] = useState({ name: '', email: '', password: '', phone: '', hospitalId: '', file: null });
    const [creatingHospitalAdmin, setCreatingHospitalAdmin] = useState(false);

    // Hospital Detail View
    const [selectedHospital, setSelectedHospital] = useState(null);
    const [hospitalStats, setHospitalStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Appointment Mode customization (per hospital, Supreme Admin only)
    const [apptMode, setApptMode] = useState('slot'); // 'slot' | 'token'
    const [savingApptMode, setSavingApptMode] = useState(false);

    // Date Filters
    const [datePreset, setDatePreset] = useState('all'); // all, today, 30, 60, 90, custom
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');

    // Staff
    const [roles, setRoles] = useState([]);
    const [showCreateStaffForm, setShowCreateStaffForm] = useState(false);
    const [createStaffForm, setCreateStaffForm] = useState({ name: '', email: '', password: '', phone: '', roleId: '', hospitalId: '', department: '', file: null });
    const [creatingStaff, setCreatingStaff] = useState(false);
    const [staffHospitalFilter, setStaffHospitalFilter] = useState('');
    const [allStaff, setAllStaff] = useState([]);
    const [loadingStaff, setLoadingStaff] = useState(false);

    // Dynamic Departments (derived from Master Question Library keys)
    const [availableDepartments, setAvailableDepartments] = useState([]);

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

    const getBaseHost = () => {
        let host = window.location.host;
        if (host.startsWith('www.')) host = host.replace('www.', '');
        const parts = host.split('.');
        if (parts.length > 2 && !host.includes('localhost')) {
            host = parts.slice(-2).join('.');
        } else if (host.includes('localhost')) {
             const port = window.location.port ? `:${window.location.port}` : '';
             host = `localhost${port}`;
        }
        return host;
    };

    useEffect(() => {
        const role = currentUser?.role;
        if (role !== 'centraladmin' && role !== 'superadmin') navigate('/supremeadmin/login');
    }, [navigate]);

    useEffect(() => {
        fetchHospitals();
        fetchRoles();
        fetchAllStaff();
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        try {
            const res = await questionLibraryAPI.getLibrary();
            if (res.success && res.data && res.data.data) {
                // The root keys of the question library JSON are the department names
                setAvailableDepartments(Object.keys(res.data.data));
            }
        } catch (err) { console.error('Failed to load global question libraries:', err); }
    };

    const fetchHospitals = async () => {
        try {
            setLoadingHospitals(true);
            const res = await hospitalAPI.getHospitals();
            if (res.success) setHospitals(res.hospitals);
        } catch (err) { console.error(err); } finally { setLoadingHospitals(false); }
    };

    const fetchRoles = async () => {
        try {
            const res = await adminAPI.getRoles();
            if (res.success) setRoles(res.data.filter(r => !['patient'].includes(r.name?.toLowerCase())));
        } catch (err) { console.error(err); }
    };

    const fetchAllStaff = async () => {
        try {
            setLoadingStaff(true);
            const res = await adminAPI.getUsers();
            if (res.success) {
                // Filter out patients, centraladmin, superadmin, hospitaladmin — only show real staff
                const staff = res.users.filter(u => {
                    const role = (u.role || '').toLowerCase();
                    return !['centraladmin', 'superadmin', 'hospitaladmin', 'patient'].includes(role);
                });
                setAllStaff(staff);
            }
        } catch (err) { console.error(err); } finally { setLoadingStaff(false); }
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
        if (preset !== 'custom' && selectedHospital) {
            fetchHospitalStats(selectedHospital._id, preset, customStartDate, customEndDate);
        }
    };

    const handleApplyCustomDate = () => {
        if (selectedHospital) {
            fetchHospitalStats(selectedHospital._id, 'custom', customStartDate, customEndDate);
        }
    };

    const openHospitalDetail = (h) => {
        setSelectedHospital(h);
        setApptMode(h.appointmentMode || 'slot');
        setDatePreset('all');
        setCustomStartDate('');
        setCustomEndDate('');
        fetchHospitalStats(h._id, 'all', '', '');
    };

    const handleSaveApptMode = async () => {
        setSavingApptMode(true);
        setError(''); setSuccess('');
        try {
            const res = await hospitalAPI.updateAppointmentMode(selectedHospital._id, apptMode);
            if (res.success) {
                setSuccess(`Appointment mode set to "${apptMode === 'token' ? 'Token Queue' : 'Time Slot'}" for ${selectedHospital.name}`);
                setSelectedHospital(prev => ({ ...prev, appointmentMode: apptMode }));
                fetchHospitals();
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update appointment mode');
        } finally {
            setSavingApptMode(false);
        }
    };

    const closeHospitalDetail = () => {
        setSelectedHospital(null);
        setHospitalStats(null);
    };

    // --- Hospital CRUD ---
    const handleSaveHospital = async (e) => {
        e.preventDefault();
        setSavingHospital(true); setError(''); setSuccess('');
        try {
            if (editHospital) {
                const res = await hospitalAPI.updateHospital(editHospital._id, hospitalForm);
                if (res.success) { setSuccess('Hospital updated!'); setEditHospital(null); setShowHospitalForm(false); fetchHospitals(); }
            } else {
                const res = await hospitalAPI.createHospital(hospitalForm);
                if (res.success) { setSuccess('Hospital created!'); setShowHospitalForm(false); setHospitalForm({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', departments: [], appointmentFee: 500 }); fetchHospitals(); }
            }
        } catch (err) { setError(err.response?.data?.message || 'Error saving hospital.'); }
        finally { setSavingHospital(false); }
    };

    const handleDeleteHospital = async (id) => {
        try {
            const res = await hospitalAPI.deleteHospital(id);
            if (res.success) {
                const log = res.deletionLog || {};
                const total = (log.users || 0) + (log.doctors || 0) + (log.appointments || 0) + (log.labs || 0) + (log.pharmacies || 0) + (log.receptions || 0) + (log.inventory || 0) + (log.roles || 0);
                setSuccess(`Hospital deleted successfully. ${total} related records removed.`);
                setDeleteHospitalConfirm(null);
                fetchHospitals();
            }
        } catch (err) { setError(err.response?.data?.message || 'Error deleting hospital.'); setDeleteHospitalConfirm(null); }
    };

    const openEditHospital = (h) => {
        setEditHospital(h);
        setHospitalForm({ name: h.name, slug: h.slug || '', address: h.address || '', city: h.city || '', state: h.state || '', phone: h.phone || '', email: h.email || '', website: h.website || '', departments: h.departments || [], appointmentFee: h.appointmentFee || 500 });
        setShowHospitalAdminForm(false);
        setShowHospitalForm(true);
        setTimeout(() => hospitalFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    };

    // --- Hospital Admin Creation ---
    const handleCreateHospitalAdmin = async (e) => {
        e.preventDefault();
        setCreatingHospitalAdmin(true); setError(''); setSuccess('');
        try {
            const res = await hospitalAdminAPI.createHospitalAdmin(hospitalAdminForm);
            if (res.success) {
                // If a photo was selected, upload it and update the new admin's avatar
                if (hospitalAdminForm.file && res.user?.id) {
                    try {
                        const formData = new FormData();
                        formData.append('images', hospitalAdminForm.file);
                        const uploadRes = await uploadAPI.uploadImages(formData);
                        if (uploadRes.success && uploadRes.files?.length > 0) {
                            await adminAPI.updateUser(res.user.id, { avatar: uploadRes.files[0].url });
                        }
                    } catch { /* avatar upload failure is non-fatal */ }
                }
                setSuccess(`✅ Hospital Admin created! Login: ${hospitalAdminForm.email}`);
                setHospitalAdminForm({ name: '', email: '', password: '', phone: '', hospitalId: '', file: null });
                setShowHospitalAdminForm(false);
                fetchHospitals();
            }
        } catch (err) { setError(err.response?.data?.message || 'Error creating hospital admin.'); }
        finally { setCreatingHospitalAdmin(false); }
    };

    // --- Staff Creation — hospital required ---
    const handleCreateStaff = async (e) => {
        e.preventDefault();
        if (!createStaffForm.hospitalId) { setError('You must select a hospital for this staff member.'); return; }
        setCreatingStaff(true); setError(''); setSuccess('');
        try {
            let avatarUrl = null;
            if (createStaffForm.file) {
                const formData = new FormData();
                formData.append('images', createStaffForm.file);
                const uploadRes = await uploadAPI.uploadImages(formData);
                if (uploadRes.success && uploadRes.files.length > 0) avatarUrl = uploadRes.files[0].url;
            }
            const res = await adminAPI.createUser({ 
                ...createStaffForm, 
                avatar: avatarUrl, 
                hospitalId: createStaffForm.hospitalId,
                departments: createStaffForm.department ? [createStaffForm.department] : [] 
            });
            if (res.success) {
                setSuccess(`✅ Staff account created! Login: ${createStaffForm.email}`);
                setCreateStaffForm({ name: '', email: '', password: '', phone: '', roleId: '', hospitalId: '', file: null });
                setShowCreateStaffForm(false);
                fetchAllStaff();
            }
        } catch (err) { setError(err.response?.data?.message || 'Error creating staff.'); }
        finally { setCreatingStaff(false); }
    };


    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
    const getHospitalName = (hid) => hospitals.find(h => h._id === hid)?.name || 'Unknown';

    const filteredStaff = staffHospitalFilter
        ? allStaff.filter(u => String(u.hospitalId) === staffHospitalFilter)
        : allStaff;

    const tabs = [
        { id: 'hospitals', label: '🏥 Hospitals', desc: 'Manage hospitals' },
        { id: 'staff', label: '👥 All Staff', desc: 'Global staff management' },
        { id: 'configurations', label: '⚙️ Configurations', desc: 'Roles, tests, questions' },
    ];

    // ==========================================
    // HOSPITAL DETAIL PANEL
    // ==========================================
    if (selectedHospital) {
        const s = hospitalStats?.stats;
        const h = hospitalStats?.hospital || selectedHospital;
        return (
            <div className="centraladmin-page">
                <div className="centraladmin-container">
                    {/* Back Header */}
                    {/* Back Header (Customized for Detail View) */}
                    <div className="centraladmin-header" style={{ marginBottom: '24px', background: 'white', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
                        <div className="header-brand">
                            <button onClick={closeHospitalDetail} className="back-btn" style={{ marginBottom: '12px' }}>← Back to All Hospitals</button>
                            <h1 style={{ fontSize: '1.6rem', fontWeight: 800 }}>🏥 {h.name}</h1>
                            <p style={{ color: '#64748b' }}>{h.city && `${h.city}, `}{h.state} {h.phone && `· 📞 ${h.phone}`}</p>
                        </div>
                        <div className="admin-user-info">
                            <span className={`status-badge ${h.isActive ? 'status-active' : 'status-inactive'}`} style={{ padding: '6px 14px' }}>
                                {h.isActive ? '● ACTIVE UNIT' : '● INACTIVE UNIT'}
                            </span>
                        </div>
                    </div>

                    {loadingStats ? (
                        <div className="loading-message" style={{ padding: '60px', textAlign: 'center', fontSize: '18px' }}>
                            ⏳ Loading hospital analytics...
                        </div>
                    ) : s ? (
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

                            {/* ---- KPI STATS ROW ---- */}
                            <div className="hospital-kpi-grid">
                                <div className="kpi-card kpi-blue">
                                    <div className="kpi-icon">👩‍⚕️</div>
                                    <div className="kpi-value">{s.totalStaff}</div>
                                    <div className="kpi-label">Total Staff</div>
                                    <div className="kpi-sub">{s.doctorCount} doctors · {s.labCount} labs · {s.pharmacyCount} pharmacy</div>
                                </div>
                                <div className="kpi-card kpi-green">
                                    <div className="kpi-icon">🧑‍🤝‍🧑</div>
                                    <div className="kpi-value">{s.totalPatients}</div>
                                    <div className="kpi-label">Unique Patients</div>
                                    <div className="kpi-sub">In selected period</div>
                                </div>
                                <div className="kpi-card kpi-purple">
                                    <div className="kpi-icon">📅</div>
                                    <div className="kpi-value">{s.totalAppointments}</div>
                                    <div className="kpi-label">Total Appointments</div>
                                    <div className="kpi-sub">In selected period</div>
                                </div>
                                <div className="kpi-card kpi-orange">
                                    <div className="kpi-icon">💰</div>
                                    <div className="kpi-value">{formatCurrency(s.totalRevenue)}</div>
                                    <div className="kpi-label">Total Revenue</div>
                                    <div className="kpi-sub">From paid appointments</div>
                                </div>
                                <div className="kpi-card kpi-teal">
                                    <div className="kpi-icon">✅</div>
                                    <div className="kpi-value">{s.completedAppointments}</div>
                                    <div className="kpi-label">Completed</div>
                                    <div className="kpi-sub">{s.pendingAppointments} pending/upcoming</div>
                                </div>
                                <div className="kpi-card kpi-pink">
                                    <div className="kpi-icon">🧪</div>
                                    <div className="kpi-value">{s.labReportCount}</div>
                                    <div className="kpi-label">Lab Reports</div>
                                    <div className="kpi-sub">{s.pendingLabReports} pending · {s.pharmacyOrderCount} pharmacy orders</div>
                                </div>
                            </div>

                            {/* ---- FEATURE QUICK ACTIONS ---- */}
                            <div className="admin-card" style={{ marginBottom: '24px' }}>
                                <h3 style={{ marginBottom: '8px' }}>⚡ Quick Feature Management</h3>
                                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>Jump to manage specific features for this hospital.</p>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {[
                                        { icon: '👨‍⚕️', label: 'Doctors', path: '/admin/doctors', bg: '#dbeafe', color: '#2563eb', border: '#bfdbfe' },
                                        { icon: '👥', label: 'Staff', path: '/admin/users', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
                                        { icon: '🔑', label: 'Roles', path: '/admin/roles', bg: '#f3e8ff', color: '#9333ea', border: '#e9d5ff' },
                                        { icon: '🧪', label: 'Labs', path: '/admin/labs', bg: '#faf5ff', color: '#7c3aed', border: '#ddd6fe' },
                                        { icon: '📋', label: 'Lab Tests', path: '/admin/lab-tests', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
                                        { icon: '💊', label: 'Pharmacy', path: '/admin/pharmacy', bg: '#ffedd5', color: '#ea580c', border: '#fed7aa' },
                                        { icon: '🏥', label: 'Reception', path: '/admin/reception', bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' },
                                        { icon: '🛠️', label: 'Services', path: '/admin/services', bg: '#fefce8', color: '#ca8a04', border: '#fef08a' },
                                        { icon: '💉', label: 'Medicines', path: '/admin/medicines', bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' },
                                    ].map((item, i) => (
                                        <button
                                            key={i}
                                            onClick={() => navigate(item.path)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: item.bg, color: item.color, border: `1px solid ${item.border}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                        >
                                            {item.icon} {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ---- APPOINTMENT MODE CUSTOMIZATION ---- */}
                            <div className="admin-card" style={{ marginBottom: '24px', border: '2px solid #e0f2fe' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                    <h3 style={{ margin: 0 }}>🎟️ Appointment System Mode</h3>
                                    <span style={{ fontSize: '0.75rem', background: h.appointmentMode === 'token' ? '#fef3c7' : '#dbeafe', color: h.appointmentMode === 'token' ? '#92400e' : '#1d4ed8', padding: '2px 10px', borderRadius: '20px', fontWeight: 700 }}>
                                        Current: {h.appointmentMode === 'token' ? 'Token Queue' : 'Time Slots'}
                                    </span>
                                </div>
                                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
                                    Choose how patients and reception staff book appointments for this hospital.
                                </p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                                    {/* Slot Mode Card */}
                                    <label style={{
                                        display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                        border: apptMode === 'slot' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                                        background: apptMode === 'slot' ? '#eff6ff' : '#f8fafc',
                                        transition: 'all 0.15s'
                                    }}>
                                        <input type="radio" name="apptMode" value="slot" checked={apptMode === 'slot'} onChange={() => setApptMode('slot')} style={{ display: 'none' }} />
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <span style={{ fontSize: '2rem', lineHeight: 1 }}>🕐</span>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: apptMode === 'slot' ? '#1d4ed8' : '#1e293b', marginBottom: '4px' }}>
                                                    Time Slot Booking
                                                    {apptMode === 'slot' && <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>Selected</span>}
                                                </div>
                                                <div style={{ fontSize: '0.83rem', color: '#64748b', lineHeight: 1.5 }}>
                                                    Patients pick a specific time (09:00, 09:30…). Doctor slots are fixed. Standard OPD scheduling.
                                                </div>
                                            </div>
                                        </div>
                                    </label>

                                    {/* Token Mode Card */}
                                    <label style={{
                                        display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                        border: apptMode === 'token' ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                        background: apptMode === 'token' ? '#fffbeb' : '#f8fafc',
                                        transition: 'all 0.15s'
                                    }}>
                                        <input type="radio" name="apptMode" value="token" checked={apptMode === 'token'} onChange={() => setApptMode('token')} style={{ display: 'none' }} />
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                            <span style={{ fontSize: '2rem', lineHeight: 1 }}>🎟️</span>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: '1rem', color: apptMode === 'token' ? '#92400e' : '#1e293b', marginBottom: '4px' }}>
                                                    Token Queue System
                                                    {apptMode === 'token' && <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>Selected</span>}
                                                </div>
                                                <div style={{ fontSize: '0.83rem', color: '#64748b', lineHeight: 1.5 }}>
                                                    Sequential tokens (1, 2, 3…) per doctor per day. Auto-resets to 1 at midnight. No time-slot picking needed.
                                                </div>
                                            </div>
                                        </div>
                                    </label>
                                </div>

                                {apptMode !== (h.appointmentMode || 'slot') && (
                                    <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', color: '#713f12', marginBottom: '14px' }}>
                                        ⚠️ You are changing the appointment mode. Existing appointments will not be affected — only new bookings will follow the new mode.
                                    </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <button
                                        onClick={handleSaveApptMode}
                                        disabled={savingApptMode || apptMode === (h.appointmentMode || 'slot')}
                                        style={{
                                            padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none',
                                            borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                                            opacity: (savingApptMode || apptMode === (h.appointmentMode || 'slot')) ? 0.5 : 1
                                        }}
                                    >
                                        {savingApptMode ? 'Saving…' : 'Save Mode'}
                                    </button>
                                    {apptMode === (h.appointmentMode || 'slot') && (
                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>No changes to save</span>
                                    )}
                                </div>
                            </div>

                            {/* ---- TWO COLUMN: Staff Breakdown + Revenue Chart ---- */}
                            <div className="detail-two-col">
                                {/* Staff breakdown */}
                                <div className="admin-card">
                                    <h3>👥 Staff Breakdown</h3>
                                    {s.staffBreakdown.length === 0 ? (
                                        <p style={{ color: '#888', fontSize: '14px' }}>No staff assigned yet.</p>
                                    ) : (
                                        <div className="staff-breakdown-list">
                                            {s.staffBreakdown
                                                .filter(item => !['patient'].includes(item.role?.toLowerCase()))
                                                .map((item, i) => (
                                                    <div key={i} className="breakdown-item">
                                                        <span className="breakdown-role">{item.role}</span>
                                                        <div className="breakdown-bar-wrap">
                                                            <div className="breakdown-bar" style={{ width: `${Math.min(100, (item.count / s.totalStaff) * 100)}%` }} />
                                                        </div>
                                                        <span className="breakdown-count">{item.count}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    )}

                                    {/* Hospital Info */}
                                    <div style={{ marginTop: '24px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
                                        <h4 style={{ margin: '0 0 12px', color: '#555' }}>🏥 Hospital Info</h4>
                                        {[
                                            { label: 'Email', value: h.email },
                                            { label: 'Website', value: h.website },
                                            { label: 'Address', value: h.address },
                                            { label: 'Admin', value: h.adminName || 'Not assigned' },
                                            { label: 'Admin Email', value: h.adminEmail },
                                            { label: 'Staff Login URL', value: h.slug && `${window.location.protocol}//${h.slug}.${getBaseHost()}/login`, isLink: true },
                                            { label: 'Appointment Fee', value: h.appointmentFee !== undefined && h.appointmentFee !== null ? formatCurrency(h.appointmentFee) : formatCurrency(500) },
                                        ].map((item, i) => item.value && (
                                            <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '14px' }}>
                                                <span style={{ color: '#888', minWidth: '90px' }}>{item.label}</span>
                                                <span style={{ color: '#333', fontWeight: '500' }}>
                                                    {item.isLink ? (
                                                        <a href={item.value} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-pink)', textDecoration: 'none' }}>
                                                            {item.value}
                                                        </a>
                                                    ) : (
                                                        item.value
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Revenue chart */}
                                <div className="admin-card">
                                    <h3>💰 Monthly Revenue (Last 6 Months)</h3>
                                    {s.monthlyRevenue.length === 0 ? (
                                        <p style={{ color: '#888', fontSize: '14px' }}>No revenue data yet.</p>
                                    ) : (
                                        <div className="revenue-chart">
                                            {s.monthlyRevenue.map((m, i) => {
                                                const maxRev = Math.max(...s.monthlyRevenue.map(x => x.revenue));
                                                const height = maxRev > 0 ? Math.max(8, (m.revenue / maxRev) * 120) : 8;
                                                return (
                                                    <div key={i} className="rev-bar-col">
                                                        <span className="rev-amount">{formatCurrency(m.revenue)}</span>
                                                        <div className="rev-bar" style={{ height: `${height}px` }} />
                                                        <span className="rev-month">{MONTHS[(m._id.month - 1)]}</span>
                                                        <span className="rev-visits">{m.count} visits</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ---- STAFF LIST ---- */}
                            <div className="admin-card">
                                <h3>👥 Staff Members ({hospitalStats.staffList?.length || 0})</h3>
                                {!hospitalStats.staffList?.length ? (
                                    <p style={{ color: '#888', fontSize: '14px' }}>No staff assigned to this hospital yet.</p>
                                ) : (
                                    <div className="users-table">
                                        <table>
                                            <thead>
                                                <tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr>
                                            </thead>
                                            <tbody>
                                                {hospitalStats.staffList.map(u => (
                                                    <tr key={u._id}>
                                                        <td><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            {u.avatar
                                                                ? <img src={u.avatar} alt={u.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                                                                : <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1' }}>{u.name?.charAt(0)?.toUpperCase()}</div>
                                                            }
                                                            {u.name}
                                                        </div></td>
                                                        <td><span className="role-badge">{u.roleName || u.role}</span></td>
                                                        <td>{u.email}</td>
                                                        <td>{u.phone || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* ---- RECENT APPOINTMENTS ---- */}
                            <div className="admin-card">
                                <h3>📋 Recent Appointments ({hospitalStats.recentAppointments?.length || 0} latest)</h3>
                                {!hospitalStats.recentAppointments?.length ? (
                                    <p style={{ color: '#888', fontSize: '14px' }}>No appointments yet.</p>
                                ) : (
                                    <div className="users-table">
                                        <table>
                                            <thead>
                                                <tr><th>Patient</th><th>Doctor</th><th>Date</th><th>Status</th><th>Amount</th></tr>
                                            </thead>
                                            <tbody>
                                                {hospitalStats.recentAppointments.map(a => (
                                                    <tr key={a._id}>
                                                        <td>{a.userId?.name || '—'}</td>
                                                        <td>{a.doctorId?.name || a.doctorName || '—'}</td>
                                                        <td>{a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString('en-IN') : '—'}</td>
                                                        <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                                                        <td style={{ fontWeight: 600 }}>{formatCurrency(a.amount)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="ca-empty">
                            <p>⚠️ Could not load hospital stats. The hospital may have no data yet.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ==========================================
    // MAIN DASHBOARD
    // ==========================================
    return (
        <div className="centraladmin-page">
            <div className={`centraladmin-container ${selectedHospital ? 'has-sidebar-padding' : ''}`}>
                {/* Redundant Header Removed (now in TopBar) */}
                <div style={{ marginBottom: '32px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'var(--brand-50, #f0fdfa)', color: 'var(--brand-600, #14b8a6)', padding: '4px 10px', borderRadius: '4px', letterSpacing: '0.05em' }}>CENTRAL ADMIN</span>
                    </div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 850, margin: '8px 0 4px', color: '#1e293b' }}>🏛️ Central Administration Dashboard</h1>
                    <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Manage all hospitals, staff, and system configurations</p>
                </div>

                {error && <div className="error-message">⚠️ {error}</div>}
                {success && <div className="success-message">✅ {success}</div>}

                {/* Tabs */}
                <div className="ca-tabs">
                    {tabs.map(tab => (
                        <button key={tab.id} className={`ca-tab ${activeTab === tab.id ? 'ca-tab-active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ========== HOSPITALS TAB ========== */}
                {activeTab === 'hospitals' && (
                    <div>
                        <div className="admin-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <h2>🏥 Registered Hospitals</h2>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Click any hospital card to view full analytics</p>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className={showHospitalAdminForm ? 'btn-cancel' : 'btn-edit'} style={{ padding: '10px 18px' }}
                                        onClick={() => { setShowHospitalAdminForm(!showHospitalAdminForm); setShowHospitalForm(false); setEditHospital(null); }}>
                                        {showHospitalAdminForm ? 'Cancel' : '👤 Add Hospital Admin'}
                                    </button>
                                    <button className={showHospitalForm ? 'btn-cancel' : 'btn-save'} style={{ padding: '10px 18px' }}
                                        onClick={() => { setShowHospitalForm(!showHospitalForm); setShowHospitalAdminForm(false); setEditHospital(null); setHospitalForm({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', departments: [], appointmentFee: 500 }); }}>
                                        {showHospitalForm ? 'Cancel' : '+ Add Hospital'}
                                    </button>
                                </div>
                            </div>

                            {/* Hospital Admin Form */}
                            {showHospitalAdminForm && (
                                <div className="ca-form-box" style={{ marginBottom: '24px' }}>
                                    <h3>👤 Create Hospital Admin Account</h3>
                                    <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>
                                        This admin will login at <strong>/hospitaladmin/login</strong> and see only their hospital's data.
                                    </p>
                                    {error && <div className="error-message">{error}</div>}
                                    {success && <div className="success-message">{success}</div>}
                                    <form onSubmit={handleCreateHospitalAdmin} className="user-form">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Full Name *</label>
                                                <input type="text" className="staff-input" placeholder="e.g. Dr. Ramesh Kumar" value={hospitalAdminForm.name} onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, name: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Email *</label>
                                                <input type="email" className="staff-input" placeholder="admin@hospital.com" value={hospitalAdminForm.email} onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, email: e.target.value })} required />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Password *</label>
                                                <input type="text" className="staff-input" placeholder="Temporary password" value={hospitalAdminForm.password} onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, password: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Phone</label>
                                                <input type="text" className="staff-input" placeholder="Phone number" value={hospitalAdminForm.phone} onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, phone: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Profile Photo</label>
                                                <input type="file" accept="image/*" className="staff-input" style={{ padding: '8px' }}
                                                    onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, file: e.target.files[0] })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Assign Hospital *</label>
                                                <select className="staff-input" value={hospitalAdminForm.hospitalId} onChange={e => setHospitalAdminForm({ ...hospitalAdminForm, hospitalId: e.target.value })} required>
                                                    <option value="">-- Select Hospital --</option>
                                                    {hospitals.map(h => <option key={h._id} value={h._id}>{h.name}{h.city ? ` — ${h.city}` : ''}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <button type="submit" disabled={creatingHospitalAdmin} className="submit-button">{creatingHospitalAdmin ? 'Creating...' : '✅ Create Hospital Admin'}</button>
                                    </form>
                                </div>
                            )}

                            {/* Hospital Add/Edit Form */}
                            {showHospitalForm && (
                                <div ref={hospitalFormRef} className="ca-form-box" style={{ marginBottom: '24px' }}>
                                    <h3>{editHospital ? '✏️ Edit Hospital' : '🏥 Add New Hospital'}</h3>
                                    {error && <div className="error-message">{error}</div>}
                                    {success && <div className="success-message">{success}</div>}
                                    <form onSubmit={handleSaveHospital} className="user-form">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Hospital Name *</label>
                                                <input type="text" className="staff-input" placeholder="e.g. City General Hospital" value={hospitalForm.name} onChange={e => setHospitalForm({ ...hospitalForm, name: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Subdomain Prefix *</label>
                                                <input type="text" className="staff-input" placeholder="e.g. citycare (maps to citycare.myurl.com)" value={hospitalForm.slug} onChange={e => setHospitalForm({ ...hospitalForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} required />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">City</label>
                                                <input type="text" className="staff-input" placeholder="e.g. Mumbai" value={hospitalForm.city} onChange={e => setHospitalForm({ ...hospitalForm, city: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">State</label>
                                                <input type="text" className="staff-input" placeholder="e.g. Maharashtra" value={hospitalForm.state} onChange={e => setHospitalForm({ ...hospitalForm, state: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Phone</label>
                                                <input type="text" className="staff-input" placeholder="Hospital contact number" value={hospitalForm.phone} onChange={e => setHospitalForm({ ...hospitalForm, phone: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Email</label>
                                                <input type="email" className="staff-input" value={hospitalForm.email} onChange={e => setHospitalForm({ ...hospitalForm, email: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Website</label>
                                                <input type="text" className="staff-input" value={hospitalForm.website} onChange={e => setHospitalForm({ ...hospitalForm, website: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Address</label>
                                            <input type="text" className="staff-input" value={hospitalForm.address} onChange={e => setHospitalForm({ ...hospitalForm, address: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Standard Appointment Fee (₹)</label>
                                            <input type="number" className="staff-input" value={hospitalForm.appointmentFee} onChange={e => setHospitalForm({ ...hospitalForm, appointmentFee: Number(e.target.value) })} min="0" />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: '16px' }}>
                                            <label className="staff-label">Departments Provided (Linked to Question Library)</label>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '5px' }}>
                                                {availableDepartments.length === 0 ? (
                                                    <span style={{ fontSize: '13px', color: '#888' }}>No departments found in Global Question Library.</span>
                                                ) : availableDepartments.map(dept => (
                                                    <label key={dept} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', cursor: 'pointer', background: '#f8fafc', padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={(hospitalForm.departments || []).includes(dept)} 
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setHospitalForm({ ...hospitalForm, departments: [...hospitalForm.departments, dept] });
                                                                } else {
                                                                    setHospitalForm({ ...hospitalForm, departments: hospitalForm.departments.filter(d => d !== dept) });
                                                                }
                                                            }} 
                                                        />
                                                        {dept}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <button type="submit" disabled={savingHospital} className="submit-button">{savingHospital ? 'Saving...' : editHospital ? '✅ Update Hospital' : '✅ Create Hospital'}</button>
                                    </form>
                                </div>
                            )}

                            {/* Hospital Cards */}
                            {loadingHospitals ? (
                                <div className="loading-message">Loading hospitals...</div>
                            ) : hospitals.length === 0 ? (
                                <div className="ca-empty"><p>🏥 No hospitals registered yet. Add your first hospital above.</p></div>
                            ) : (
                                <div className="hospitals-grid">
                                    {hospitals.map(h => (
                                        <div key={h._id} className={`hospital-card clickable-card ${!h.isActive ? 'hospital-inactive' : ''}`} onClick={() => openHospitalDetail(h)}>
                                            <div className="hospital-card-header">
                                                <div className="hospital-icon">
                                                    {h.branding?.logoUrl
                                                        ? <img src={h.branding.logoUrl} alt={h.name} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }} />
                                                        : <span>🏥</span>
                                                    }
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    {h.branding?.primaryColor && (
                                                        <span title="Custom branding" style={{ width: 12, height: 12, borderRadius: '50%', background: h.branding.primaryColor, border: '1.5px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                                                    )}
                                                    <span className={`status-badge ${h.isActive ? 'status-active' : 'status-inactive'}`}>{h.isActive ? 'Active' : 'Inactive'}</span>
                                                </div>
                                            </div>
                                            <h3 className="hospital-name">{h.branding?.appName || h.name}</h3>
                                            {h.branding?.tagline && <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 6px', fontStyle: 'italic' }}>{h.branding.tagline}</p>}
                                            <div className="hospital-meta">
                                                {h.city && <span>📍 {h.city}{h.state ? `, ${h.state}` : ''}</span>}
                                                {h.phone && <span>📞 {h.phone}</span>}
                                                {h.email && <span>✉️ {h.email}</span>}
                                                {h.slug && <a href={`${window.location.protocol}//${h.slug}.${getBaseHost()}`} target="_blank" rel="noreferrer" style={{display: 'inline-block', marginTop: '6px', background: 'var(--brand-pink)', color: 'white', padding: '2px 6px', fontSize: '10px', borderRadius: '4px', textDecoration: 'none'}}>🌐 {h.slug}.{getBaseHost()}</a>}
                                                {(h.departments && h.departments.length > 0) && (
                                                    <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                                                        <strong>Depts:</strong> {h.departments.join(', ')}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="hospital-click-hint">📊 Click to view full analytics →</div>
                                            <div className="hospital-actions" onClick={e => e.stopPropagation()}>
                                                <button
                                                    className="btn-edit"
                                                    style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', color: '#15803d', border: '1.5px solid #86efac' }}
                                                    onClick={() => setBrandingHospital(h)}
                                                >🎨 Branding</button>
                                                <button className="btn-edit" onClick={() => openEditHospital(h)}>Edit</button>
                                                <button className="btn-delete" onClick={() => setDeleteHospitalConfirm(h._id)}>Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ========== STAFF TAB ========== */}
                {activeTab === 'staff' && (
                    <div>
                        <div className="admin-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <div>
                                    <h2>👥 Add New Staff Member</h2>
                                    <p style={{ color: '#e53935', fontSize: '13px', fontWeight: 600, margin: '4px 0 0' }}>
                                        ⚠️ Every staff member must be linked to a specific hospital
                                    </p>
                                </div>
                                <button onClick={() => setShowCreateStaffForm(!showCreateStaffForm)} className={showCreateStaffForm ? 'btn-cancel' : 'btn-save'} style={{ padding: '8px 20px' }}>
                                    {showCreateStaffForm ? 'Cancel' : '+ New Staff'}
                                </button>
                            </div>
                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success}</div>}
                            {showCreateStaffForm && (
                                <form onSubmit={handleCreateStaff} className="user-form">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Assign Hospital *</label>
                                            <select className="staff-input" value={createStaffForm.hospitalId} onChange={e => setCreateStaffForm({ ...createStaffForm, hospitalId: e.target.value })} required
                                                style={{ borderColor: !createStaffForm.hospitalId ? '#e53935' : undefined }}>
                                                <option value="">-- Select Hospital (Required) --</option>
                                                {hospitals.map(h => <option key={h._id} value={h._id}>{h.name}{h.city ? ` — ${h.city}` : ''}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Assign Role *</label>
                                            <select value={createStaffForm.roleId} onChange={e => setCreateStaffForm({ ...createStaffForm, roleId: e.target.value })} required className="staff-input">
                                                <option value="">-- Select a Role --</option>
                                                {roles.map(role => <option key={role._id} value={role._id}>{role.name}{role.description ? ` — ${role.description}` : ''}</option>)}
                                            </select>
                                        </div>
                                        {createStaffForm.hospitalId && (
                                            <div className="form-group">
                                                <label className="staff-label">Assign Department</label>
                                                <select value={createStaffForm.department} onChange={e => setCreateStaffForm({ ...createStaffForm, department: e.target.value })} className="staff-input">
                                                    <option value="">-- No Department --</option>
                                                    {hospitals.find(h => h._id === createStaffForm.hospitalId)?.departments?.map(dept => (
                                                        <option key={dept} value={dept}>{dept}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Full Name *</label>
                                            <input type="text" placeholder="e.g. Dr. Sharma" value={createStaffForm.name} onChange={e => setCreateStaffForm({ ...createStaffForm, name: e.target.value })} required className="staff-input" />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Email Address *</label>
                                            <input type="email" placeholder="staff@hospital.com" value={createStaffForm.email} onChange={e => setCreateStaffForm({ ...createStaffForm, email: e.target.value })} required className="staff-input" />
                                        </div>
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="staff-label">Password *</label>
                                            <input type="text" placeholder="Temporary password" value={createStaffForm.password} onChange={e => setCreateStaffForm({ ...createStaffForm, password: e.target.value })} required className="staff-input" />
                                        </div>
                                        <div className="form-group">
                                            <label className="staff-label">Phone</label>
                                            <input type="text" placeholder="Phone number" value={createStaffForm.phone} onChange={e => setCreateStaffForm({ ...createStaffForm, phone: e.target.value })} className="staff-input" />
                                        </div>
                                    </div>
                                    <button type="submit" disabled={creatingStaff || !createStaffForm.hospitalId} className="submit-button">
                                        {creatingStaff ? 'Creating...' : '✅ Create Staff Account'}
                                    </button>
                                </form>
                            )}
                        </div>

                        {/* Staff list with hospital filter */}
                        <div className="admin-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h2>All Staff ({filteredStaff.length})</h2>
                                <select className="staff-input" style={{ width: '240px' }} value={staffHospitalFilter} onChange={e => setStaffHospitalFilter(e.target.value)}>
                                    <option value="">All Hospitals</option>
                                    {hospitals.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                                </select>
                            </div>
                            {loadingStaff ? (
                                <div className="loading-message">Loading staff...</div>
                            ) : filteredStaff.length === 0 ? (
                                <div className="ca-empty"><p>No staff found{staffHospitalFilter ? ' for this hospital' : ''}.</p></div>
                            ) : (
                                <div className="users-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Avatar</th><th>Name</th><th>Hospital</th><th>Role</th><th>Email</th><th>Phone</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredStaff.map(u => (
                                                <tr key={u.id || u._id}>
                                                    <td>{u.avatar
                                                        ? <img src={u.avatar} alt={u.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                                                        : <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1', fontSize: '14px' }}>{u.name?.charAt(0)?.toUpperCase()}</div>
                                                    }</td>
                                                    <td style={{ fontWeight: 500 }}>{u.name}</td>
                                                    <td>
                                                        <span style={{ background: '#f0f9ff', color: '#0284c7', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                                                            {u.hospitalId ? getHospitalName(u.hospitalId) : '⚠️ No hospital'}
                                                        </span>
                                                    </td>
                                                    <td><span className={`role-badge role-${(u.role || '').toLowerCase()}`}>{(u.role || 'No Role').toUpperCase()}</span></td>
                                                    <td>{u.email}</td>
                                                    <td>{u.phone || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ========== CONFIGURATIONS TAB ========== */}
                {activeTab === 'configurations' && (
                    <div className="admin-card">
                        <h2>⚙️ System Configurations</h2>
                        <p style={{ color: '#888', fontSize: '14px', margin: '5px 0 20px' }}>
                            Manage global settings — roles, question libraries, lab tests, medicines, services, and test packages.
                        </p>
                        <div className="config-grid">
                            {[
                                { icon: '🔑', label: 'Roles & Permissions', desc: 'Create and manage user roles', path: '/admin/roles', bg: '#eff6ff', color: '#3b82f6' },
                                { icon: '❓', label: 'Question Library', desc: 'Configure assessment forms', path: '/admin/question-library', bg: '#f5f3ff', color: '#8b5cf6' },
                                { icon: '🧪', label: 'Lab Tests', desc: 'Manage lab test catalog', path: '/admin/lab-tests', bg: '#fdf4ff', color: '#d946ef' },
                                { icon: '📦', label: 'Test Packages', desc: 'Bundle lab tests into packages', path: '/admin/test-packages', bg: '#f0fdf4', color: '#22c55e' },
                                { icon: '💊', label: 'Medicine Catalog', desc: 'Global medicine library', path: '/admin/medicines', bg: '#fff7ed', color: '#f97316' },
                                { icon: '🛠️', label: 'Services', desc: 'Hospital services & pricing', path: '/admin/services', bg: '#fefce8', color: '#eab308' },
                                { icon: '🏥', label: 'Labs', desc: 'Manage lab departments', path: '/admin/labs', bg: '#f0f9ff', color: '#0ea5e9' },
                                { icon: '💊', label: 'Pharmacy', desc: 'Manage pharmacy departments', path: '/admin/pharmacy', bg: '#fff1f2', color: '#f43f5e' },
                            ].map((item, i) => (
                                <div key={i} className="config-card" onClick={() => navigate(item.path)} style={{ background: item.bg }}>
                                    <div className="config-icon" style={{ color: item.color }}>{item.icon}</div>
                                    <div>
                                        <h4 style={{ color: item.color, margin: '0 0 4px' }}>{item.label}</h4>
                                        <p style={{ color: '#888', margin: 0, fontSize: '13px' }}>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Delete Hospital Confirm */}
                {deleteHospitalConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Delete Hospital?</h3>
                            <p style={{ color: '#dc2626', fontWeight: '600' }}>WARNING: This will permanently delete the hospital and ALL related data including doctors, staff, patients, appointments, lab records, pharmacy records, inventory, and the entire hospital database. This action CANNOT be undone.</p>
                            <div className="modal-buttons">
                                <button onClick={() => handleDeleteHospital(deleteHospitalConfirm)} className="btn-confirm-delete">Delete</button>
                                <button onClick={() => setDeleteHospitalConfirm(null)} className="btn-cancel">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 🎨 Branding Editor Modal */}
            {brandingHospital && (
                <HospitalBrandingEditor
                    hospital={brandingHospital}
                    onClose={() => { setBrandingHospital(null); fetchHospitals(); }}
                />
            )}
        </div>
    );
};

export default CentralAdminDashboard;
