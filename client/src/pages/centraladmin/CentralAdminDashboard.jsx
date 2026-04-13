import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminAPI, uploadAPI, hospitalAPI, hospitalAdminAPI, questionLibraryAPI, simpleClinicAPI, revenueAPI } from '../../utils/api';
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

    // Simple Clinics
    const [clinics, setClinics] = useState([]);
    const [loadingClinics, setLoadingClinics] = useState(false);
    const [showClinicForm, setShowClinicForm] = useState(false);
    const [clinicForm, setClinicForm] = useState({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', appointmentFee: 300 });
    const [editClinic, setEditClinic] = useState(null);
    const [savingClinic, setSavingClinic] = useState(false);
    const [deleteClinicConfirm, setDeleteClinicConfirm] = useState(null);
    const [selectedClinic, setSelectedClinic] = useState(null);
    const [clinicStats, setClinicStats] = useState(null);
    const [loadingClinicStats, setLoadingClinicStats] = useState(false);
    const [showClinicManagerForm, setShowClinicManagerForm] = useState(false);
    const [clinicManagerForm, setClinicManagerForm] = useState({ name: '', email: '', password: '', phone: '' });
    const [savingClinicManager, setSavingClinicManager] = useState(false);
    const [showClinicStaffForm, setShowClinicStaffForm] = useState(false);
    const [clinicStaffForm, setClinicStaffForm] = useState({ name: '', email: '', password: '', phone: '', staffRole: 'doctor' });
    const [savingClinicStaff, setSavingClinicStaff] = useState(false);
    const [clinicSubscriptions, setClinicSubscriptions] = useState([]);
    const [subscriptionRateForm, setSubscriptionRateForm] = useState({ ratePerPatient: '', billingEnabled: false });
    const [savingRate, setSavingRate] = useState(false);

    // Clinic appointment mode (Central Admin only)
    const [clinicApptMode, setClinicApptMode] = useState('token'); // 'slot' | 'token'
    const [savingClinicApptMode, setSavingClinicApptMode] = useState(false);

    // Revenue Plans tab
    const [revenuePlans, setRevenuePlans] = useState([]);
    const [loadingRevenuePlans, setLoadingRevenuePlans] = useState(false);
    const [revenuePlanSearch, setRevenuePlanSearch] = useState('');
    const [editingPlan, setEditingPlan] = useState(null); // hospital being edited
    const [planForm, setPlanForm] = useState({ revenueModel: 'per_patient', ratePerPatient: '', monthlyFee: '', ratePerLogin: '', billingCycle: 'monthly' });
    const [savingPlan, setSavingPlan] = useState(false);

    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const location = useLocation();

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
        // Only redirect if user is logged in but has the wrong role (not during logout)
        if (role && role !== 'centraladmin' && role !== 'superadmin') navigate('/login');
    }, [navigate]);

    useEffect(() => {
        fetchHospitals();
        fetchRoles();
        fetchAllStaff();
        fetchDepartments();
        fetchClinics();
    }, []);

    // Handle navigation state from SystemRevenueDashboard "Manage Plan" button
    useEffect(() => {
        if (location.state?.openTab === 'revenue-plans') {
            setActiveTab('revenue-plans');
        }
    }, [location.state]);

    // Auto-load revenue plans when the tab becomes active
    useEffect(() => {
        if (activeTab === 'revenue-plans' && revenuePlans.length === 0) {
            fetchRevenuePlans();
        }
    }, [activeTab]);

    const fetchRevenuePlans = async () => {
        setLoadingRevenuePlans(true);
        try {
            const res = await revenueAPI.getHospitalsRevenue();
            if (res.success) setRevenuePlans(res.hospitals || []);
        } catch (err) { console.error('Failed to load revenue plans:', err); }
        finally { setLoadingRevenuePlans(false); }
    };

    const openPlanEditor = (hospital) => {
        setEditingPlan(hospital);
        setPlanForm({
            revenueModel: hospital.revenueModel || 'per_patient',
            ratePerPatient: hospital.subscription?.ratePerPatient ?? '',
            monthlyFee: hospital.revenueConfig?.monthlyFee ?? '',
            ratePerLogin: hospital.revenueConfig?.ratePerLogin ?? '',
            billingCycle: hospital.revenueConfig?.billingCycle || 'monthly',
        });
    };

    const handleSavePlan = async (e) => {
        e.preventDefault();
        setSavingPlan(true);
        try {
            await revenueAPI.setHospitalPlan(editingPlan._id, {
                revenueModel: planForm.revenueModel,
                ratePerPatient: planForm.ratePerPatient !== '' ? Number(planForm.ratePerPatient) : undefined,
                monthlyFee: planForm.monthlyFee !== '' ? Number(planForm.monthlyFee) : undefined,
                ratePerLogin: planForm.ratePerLogin !== '' ? Number(planForm.ratePerLogin) : undefined,
                billingCycle: planForm.billingCycle,
            });
            setSuccess(`Revenue plan updated for ${editingPlan.name}`);
            setEditingPlan(null);
            fetchRevenuePlans();
        } catch (err) { setError(err?.response?.data?.message || err.message); }
        finally { setSavingPlan(false); }
    };

    const fetchDepartments = async () => {
        try {
            const res = await questionLibraryAPI.getLibrary();
            if (res.success && res.data && res.data.data) {
                // The root keys of the question library JSON are the department names
                setAvailableDepartments(Object.keys(res.data.data));
            }
        } catch (err) { console.error('Failed to load global question libraries:', err); }
    };

    // ==========================================
    // SIMPLE CLINIC HANDLERS
    // ==========================================
    const fetchClinics = async () => {
        try {
            setLoadingClinics(true);
            const res = await simpleClinicAPI.getClinics();
            if (res.success) setClinics(res.clinics);
        } catch (err) { console.error('Failed to load clinics:', err); }
        finally { setLoadingClinics(false); }
    };

    const openClinicDetail = async (clinic) => {
        setSelectedClinic(clinic);
        setClinicApptMode(clinic.appointmentMode || 'token');
        setLoadingClinicStats(true);
        setClinicStats(null);
        setClinicSubscriptions([]);
        setSubscriptionRateForm({
            ratePerPatient: clinic.subscription?.ratePerPatient ?? '',
            billingEnabled: clinic.subscription?.billingEnabled ?? false,
        });
        try {
            const [statsRes, subRes] = await Promise.all([
                simpleClinicAPI.getStats(clinic._id),
                simpleClinicAPI.getSubscriptions(clinic._id),
            ]);
            if (statsRes.success) setClinicStats(statsRes);
            if (subRes.success) setClinicSubscriptions(subRes.subscriptions || []);
        } catch (err) { console.error('Failed to load clinic stats:', err); }
        finally { setLoadingClinicStats(false); }
    };

    const closeClinicDetail = () => { setSelectedClinic(null); setClinicStats(null); setShowClinicManagerForm(false); setShowClinicStaffForm(false); setClinicSubscriptions([]); };

    const handleSaveRate = async (e) => {
        e.preventDefault();
        setSavingRate(true);
        try {
            await simpleClinicAPI.setRate(selectedClinic._id, subscriptionRateForm);
            setSuccess('Billing rate updated successfully');
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingRate(false); }
    };

    const handleSaveClinicApptMode = async () => {
        setSavingClinicApptMode(true);
        setError(''); setSuccess('');
        try {
            const res = await simpleClinicAPI.updateAppointmentMode(selectedClinic._id, clinicApptMode);
            if (res.success) {
                setSuccess(`Appointment mode set to "${clinicApptMode === 'token' ? 'Token Queue' : 'Time Slot'}" for ${selectedClinic.name}`);
                setSelectedClinic(prev => ({ ...prev, appointmentMode: clinicApptMode }));
                fetchClinics();
            }
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingClinicApptMode(false); }
    };

    const handleMarkSubscription = async (subId, status) => {
        try {
            const res = await simpleClinicAPI.updateSubscription(selectedClinic._id, subId, { status });
            if (res.success) {
                setClinicSubscriptions(prev => prev.map(s => s._id === subId ? res.subscription : s));
                setSuccess(`Month marked as ${status}`);
            }
        } catch (err) { setError(err.response?.data?.message || err.message); }
    };

    const handleSaveClinic = async (e) => {
        e.preventDefault();
        setSavingClinic(true);
        setError(''); setSuccess('');
        try {
            if (editClinic) {
                const res = await simpleClinicAPI.updateClinic(editClinic._id, clinicForm);
                if (res.success) { setSuccess('Clinic updated.'); fetchClinics(); setEditClinic(null); setShowClinicForm(false); }
                else setError(res.message || 'Failed to update clinic');
            } else {
                const res = await simpleClinicAPI.createClinic(clinicForm);
                if (res.success) { setSuccess('Clinic created successfully!'); fetchClinics(); setShowClinicForm(false); setClinicForm({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', appointmentFee: 300 }); }
                else setError(res.message || 'Failed to create clinic');
            }
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingClinic(false); }
    };

    const handleDeleteClinic = async (id) => {
        try {
            const res = await simpleClinicAPI.deleteClinic(id);
            if (res.success) { setSuccess('Clinic deleted.'); fetchClinics(); setDeleteClinicConfirm(null); }
            else setError(res.message);
        } catch (err) { setError(err.response?.data?.message || err.message); }
    };

    const handleCreateClinicManager = async (e) => {
        e.preventDefault();
        setSavingClinicManager(true);
        setError(''); setSuccess('');
        try {
            const res = await simpleClinicAPI.createManager(selectedClinic._id, clinicManagerForm);
            if (res.success) {
                setSuccess(`Admin created! ${res.manager.name} can now login at /login with email: ${res.manager.email}`);
                setShowClinicManagerForm(false);
                setClinicManagerForm({ name: '', email: '', password: '', phone: '' });
                // Refresh clinic list and re-open detail with fresh data
                await fetchClinics();
                // Re-fetch stats so adminUserId populates
                setLoadingClinicStats(true);
                const statsRes = await simpleClinicAPI.getStats(selectedClinic._id);
                if (statsRes.success) setClinicStats(statsRes);
                setLoadingClinicStats(false);
            } else setError(res.message);
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingClinicManager(false); }
    };

    const handleCreateClinicStaff = async (e) => {
        e.preventDefault();
        setSavingClinicStaff(true);
        setError(''); setSuccess('');
        try {
            const res = await simpleClinicAPI.createStaff(selectedClinic._id, clinicStaffForm);
            if (res.success) {
                setSuccess('Staff member added!');
                setShowClinicStaffForm(false);
                setClinicStaffForm({ name: '', email: '', password: '', phone: '', roleId: '' });
                openClinicDetail(selectedClinic);
            } else setError(res.message);
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingClinicStaff(false); }
    };

    const handleDeleteClinicStaff = async (userId) => {
        if (!window.confirm('Remove this staff member?')) return;
        try {
            const res = await simpleClinicAPI.deleteStaff(selectedClinic._id, userId);
            if (res.success) { setSuccess('Staff removed.'); openClinicDetail(selectedClinic); }
            else setError(res.message);
        } catch (err) { setError(err.response?.data?.message || err.message); }
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

    const MODEL_LABELS = {
        per_patient: { label: 'Model B — Per Patient', color: '#6366f1', bg: '#ede9fe', icon: '👤' },
        fixed_monthly: { label: 'Model A — Fixed Monthly', color: '#10b981', bg: '#d1fae5', icon: '📅' },
        per_login: { label: 'Model C — Per Login', color: '#f59e0b', bg: '#fef3c7', icon: '🔑' },
    };

    const tabs = [
        { id: 'hospitals', label: '🏥 Hospitals', desc: 'Manage hospitals' },
        { id: 'simple-clinics', label: '🏪 Simple Clinics', desc: 'Small clinic management' },
        { id: 'staff', label: '👥 All Staff', desc: 'Global staff management' },
        { id: 'revenue-plans', label: '💰 Revenue Plans', desc: 'Set billing models' },
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
                <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, background: 'var(--brand-50, #f0fdfa)', color: 'var(--brand-600, #14b8a6)', padding: '4px 10px', borderRadius: '4px', letterSpacing: '0.05em' }}>CENTRAL ADMIN</span>
                        </div>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: 850, margin: '8px 0 4px', color: '#1e293b' }}>🏛️ Central Administration Dashboard</h1>
                        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Manage all hospitals, staff, and system configurations</p>
                    </div>
                    <button
                        onClick={() => navigate('/supremeadmin/revenue')}
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', whiteSpace: 'nowrap' }}
                    >
                        📊 System Revenue Analytics
                    </button>
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
                                        This admin will login at <strong>/login</strong> and see only their hospital's data.
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

                {/* ========== SIMPLE CLINICS TAB ========== */}
                {activeTab === 'simple-clinics' && !selectedClinic && (
                    <div>
                        <div className="admin-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <h2>🏪 Simple Clinics</h2>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Small clinics managed by 1–4 staff. All features included: patients, doctor, billing, analytics.</p>
                                </div>
                                <button className={showClinicForm ? 'btn-cancel' : 'btn-save'} style={{ padding: '10px 18px' }}
                                    onClick={() => { setShowClinicForm(!showClinicForm); setEditClinic(null); setClinicForm({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', appointmentFee: 300 }); }}>
                                    {showClinicForm ? 'Cancel' : '+ Add Simple Clinic'}
                                </button>
                            </div>

                            {/* Add / Edit Clinic Form */}
                            {showClinicForm && (
                                <div className="ca-form-box" style={{ marginBottom: '24px' }}>
                                    <h3>{editClinic ? '✏️ Edit Clinic' : '🏪 Add New Simple Clinic'}</h3>
                                    {error && <div className="error-message">{error}</div>}
                                    {success && <div className="success-message">{success}</div>}
                                    <form onSubmit={handleSaveClinic} className="user-form">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Clinic Name *</label>
                                                <input type="text" className="staff-input" placeholder="e.g. Sharma Family Clinic" value={clinicForm.name}
                                                    onChange={e => setClinicForm({ ...clinicForm, name: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Subdomain / Slug *</label>
                                                <input type="text" className="staff-input" placeholder="e.g. sharma-clinic" value={clinicForm.slug}
                                                    onChange={e => setClinicForm({ ...clinicForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                                                <small style={{ color: '#888' }}>Leave blank to auto-generate from name</small>
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Address</label>
                                                <input type="text" className="staff-input" placeholder="Street address" value={clinicForm.address}
                                                    onChange={e => setClinicForm({ ...clinicForm, address: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">City</label>
                                                <input type="text" className="staff-input" placeholder="e.g. Delhi" value={clinicForm.city}
                                                    onChange={e => setClinicForm({ ...clinicForm, city: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">State</label>
                                                <input type="text" className="staff-input" placeholder="e.g. Delhi" value={clinicForm.state}
                                                    onChange={e => setClinicForm({ ...clinicForm, state: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Phone</label>
                                                <input type="text" className="staff-input" placeholder="Clinic contact number" value={clinicForm.phone}
                                                    onChange={e => setClinicForm({ ...clinicForm, phone: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Email</label>
                                                <input type="email" className="staff-input" placeholder="clinic@email.com" value={clinicForm.email}
                                                    onChange={e => setClinicForm({ ...clinicForm, email: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Consultation Fee (₹)</label>
                                                <input type="number" className="staff-input" placeholder="300" value={clinicForm.appointmentFee}
                                                    onChange={e => setClinicForm({ ...clinicForm, appointmentFee: Number(e.target.value) })} />
                                            </div>
                                        </div>
                                        <button type="submit" disabled={savingClinic} className="submit-button">
                                            {savingClinic ? 'Saving...' : editClinic ? '✅ Update Clinic' : '✅ Create Clinic'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Clinics List */}
                            {loadingClinics ? (
                                <div className="loading-message">Loading clinics...</div>
                            ) : clinics.length === 0 ? (
                                <div className="ca-empty">
                                    <p>No simple clinics yet. Click <strong>+ Add Simple Clinic</strong> to get started.</p>
                                </div>
                            ) : (
                                <div className="hospital-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                    {clinics.map(clinic => (
                                        <div key={clinic._id} className="hospital-card" style={{ cursor: 'pointer', border: '2px solid #e2e8f0', borderRadius: '12px', padding: '20px', background: '#fff', transition: 'box-shadow 0.2s' }}
                                            onClick={() => openClinicDetail(clinic)}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🏪</div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{clinic.name}</h3>
                                                    <span style={{ fontSize: '12px', color: '#64748b' }}>{clinic.city}{clinic.state ? `, ${clinic.state}` : ''}</span>
                                                </div>
                                                <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '4px', background: clinic.isActive ? '#dcfce7' : '#fee2e2', color: clinic.isActive ? '#16a34a' : '#dc2626' }}>
                                                    {clinic.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                                                {clinic.phone && <div>📞 {clinic.phone}</div>}
                                                {clinic.email && <div>✉️ {clinic.email}</div>}
                                                <div style={{ marginTop: '6px' }}>💰 Fee: {formatCurrency(clinic.appointmentFee)}</div>
                                                {clinic.slug && <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>🔗 /{clinic.slug}</div>}
                                                <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: clinic.adminUserId ? '#f0fdf4' : '#fff7ed', border: `1px solid ${clinic.adminUserId ? '#bbf7d0' : '#fed7aa'}` }}>
                                                    {clinic.adminUserId
                                                        ? <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>👤 Admin: {clinic.adminUserId.name}</span>
                                                        : <span style={{ color: '#d97706', fontSize: '12px', fontWeight: 600 }}>⚠️ No admin assigned</span>
                                                    }
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                                                <button className="btn-edit" style={{ flex: 1, fontSize: '12px', padding: '6px' }}
                                                    onClick={() => { setEditClinic(clinic); setClinicForm({ name: clinic.name, slug: clinic.slug || '', address: clinic.address || '', city: clinic.city || '', state: clinic.state || '', phone: clinic.phone || '', email: clinic.email || '', website: clinic.website || '', appointmentFee: clinic.appointmentFee || 300 }); setShowClinicForm(true); }}>
                                                    ✏️ Edit
                                                </button>
                                                <button className="btn-confirm-delete" style={{ flex: 1, fontSize: '12px', padding: '6px' }}
                                                    onClick={() => setDeleteClinicConfirm(clinic._id)}>
                                                    🗑️ Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ========== SIMPLE CLINIC DETAIL VIEW ========== */}
                {activeTab === 'simple-clinics' && selectedClinic && (
                    <div>
                        {/* Header */}
                        <div className="admin-card" style={{ marginBottom: '16px' }}>
                            <button onClick={closeClinicDetail} className="back-btn" style={{ marginBottom: '12px' }}>← Back to All Clinics</button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ fontSize: '40px' }}>🏪</div>
                                <div>
                                    <h2 style={{ margin: 0 }}>{selectedClinic.name}</h2>
                                    <p style={{ color: '#64748b', margin: '4px 0 0' }}>
                                        {selectedClinic.city}{selectedClinic.state ? `, ${selectedClinic.state}` : ''}
                                        {selectedClinic.phone ? ` · 📞 ${selectedClinic.phone}` : ''}
                                        {selectedClinic.slug ? ` · 🔗 /${selectedClinic.slug}` : ''}
                                    </p>
                                </div>
                                <span style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, fontSize: '13px', background: selectedClinic.isActive ? '#dcfce7' : '#fee2e2', color: selectedClinic.isActive ? '#16a34a' : '#dc2626' }}>
                                    {selectedClinic.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>

                        {error && <div className="error-message" style={{ marginBottom: '16px' }}>⚠️ {error}</div>}
                        {success && <div className="success-message" style={{ marginBottom: '16px' }}>✅ {success}</div>}

                        {loadingClinicStats ? (
                            <div className="loading-message">Loading analytics...</div>
                        ) : clinicStats ? (
                            <>
                                {/* KPI Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                    {[
                                        { label: 'Total Patients', value: clinicStats.stats.totalPatients, icon: '👤', color: '#0ea5e9', bg: '#f0f9ff' },
                                        { label: 'Total Appointments', value: clinicStats.stats.totalAppointments, icon: '📅', color: '#8b5cf6', bg: '#f5f3ff' },
                                        { label: 'Completed', value: clinicStats.stats.completedAppointments, icon: '✅', color: '#10b981', bg: '#f0fdf4' },
                                        { label: 'Revenue', value: formatCurrency(clinicStats.stats.revenue), icon: '💰', color: '#f59e0b', bg: '#fffbeb' },
                                        { label: 'Staff Members', value: clinicStats.stats.staff?.length || 0, icon: '👥', color: '#6366f1', bg: '#eef2ff' },
                                    ].map((kpi, i) => (
                                        <div key={i} className="admin-card" style={{ background: kpi.bg, border: `1px solid ${kpi.color}22`, textAlign: 'center', padding: '18px' }}>
                                            <div style={{ fontSize: '28px', marginBottom: '6px' }}>{kpi.icon}</div>
                                            <div style={{ fontSize: '22px', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{kpi.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Clinic Admin Section */}
                                <div className="admin-card" style={{ marginBottom: '20px', border: '2px solid #e0e7ff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>👤 Clinic Admin Account</h3>
                                            <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>
                                                The admin has full access to this clinic. Login at <strong>/login</strong>
                                            </p>
                                        </div>
                                        <button className={showClinicManagerForm ? 'btn-cancel' : 'btn-save'} style={{ fontSize: '13px', padding: '8px 16px' }}
                                            onClick={() => { setShowClinicManagerForm(!showClinicManagerForm); setShowClinicStaffForm(false); setClinicManagerForm({ name: '', email: '', password: '', phone: '' }); }}>
                                            {showClinicManagerForm ? 'Cancel' : clinicStats.clinic?.adminUserId ? '🔄 Add Another Admin' : '+ Add Clinic Admin'}
                                        </button>
                                    </div>

                                    {/* Current admin info */}
                                    {clinicStats.clinic?.adminUserId && !showClinicManagerForm && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 18px' }}>
                                            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 700, color: '#16a34a' }}>
                                                {clinicStats.clinic.adminUserId.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '15px' }}>{clinicStats.clinic.adminUserId.name}</div>
                                                <div style={{ color: '#64748b', fontSize: '13px' }}>{clinicStats.clinic.adminUserId.email}</div>
                                                {clinicStats.clinic.adminUserId.phone && <div style={{ color: '#64748b', fontSize: '13px' }}>📞 {clinicStats.clinic.adminUserId.phone}</div>}
                                            </div>
                                            <span style={{ marginLeft: 'auto', background: '#dcfce7', color: '#16a34a', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>CLINIC ADMIN</span>
                                        </div>
                                    )}

                                    {!clinicStats.clinic?.adminUserId && !showClinicManagerForm && (
                                        <div style={{ textAlign: 'center', padding: '24px', background: '#fff7ed', borderRadius: '10px', border: '1px dashed #fed7aa' }}>
                                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
                                            <p style={{ color: '#92400e', fontWeight: 600, margin: '0 0 4px' }}>No admin assigned yet</p>
                                            <p style={{ color: '#b45309', fontSize: '13px', margin: 0 }}>Click <strong>+ Add Clinic Admin</strong> to create login credentials for this clinic.</p>
                                        </div>
                                    )}

                                    {/* Add Admin Form */}
                                    {showClinicManagerForm && (
                                        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '20px', border: '1px solid #e2e8f0' }}>
                                            <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>Create Clinic Admin Account</h4>
                                            <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>This person will have full access — patients, appointments, billing, pharmacy, analytics.</p>
                                            {error && <div className="error-message">{error}</div>}
                                            <form onSubmit={handleCreateClinicManager} className="user-form">
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Full Name *</label>
                                                        <input type="text" className="staff-input" placeholder="e.g. Dr. Ramesh Sharma" value={clinicManagerForm.name}
                                                            onChange={e => setClinicManagerForm({ ...clinicManagerForm, name: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Email Address *</label>
                                                        <input type="email" className="staff-input" placeholder="admin@clinic.com" value={clinicManagerForm.email}
                                                            onChange={e => setClinicManagerForm({ ...clinicManagerForm, email: e.target.value })} required />
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Password *</label>
                                                        <input type="text" className="staff-input" placeholder="Set a temporary password" value={clinicManagerForm.password}
                                                            onChange={e => setClinicManagerForm({ ...clinicManagerForm, password: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Phone</label>
                                                        <input type="text" className="staff-input" placeholder="Phone number" value={clinicManagerForm.phone}
                                                            onChange={e => setClinicManagerForm({ ...clinicManagerForm, phone: e.target.value })} />
                                                    </div>
                                                </div>
                                                <button type="submit" disabled={savingClinicManager} className="submit-button" style={{ marginTop: '4px' }}>
                                                    {savingClinicManager ? 'Creating...' : '✅ Create Clinic Admin'}
                                                </button>
                                            </form>
                                        </div>
                                    )}
                                </div>

                                {/* Staff Management */}
                                <div className="admin-card" style={{ marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div>
                                            <h3 style={{ margin: 0 }}>👥 Additional Staff</h3>
                                            <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>
                                                Tier: {clinicStats.stats.staff?.filter(s=>s.role==='doctor').length||0}/{clinicStats.clinic?.tier?.maxDoctors||1} Doctors · {clinicStats.stats.staff?.filter(s=>s.role==='receptionist').length||0}/{clinicStats.clinic?.tier?.maxReceptionists||1} Receptionists · All login at <strong>/login</strong>
                                            </p>
                                        </div>
                                        <button className="btn-edit" style={{ fontSize: '13px', padding: '8px 14px' }}
                                            onClick={() => { setShowClinicStaffForm(!showClinicStaffForm); setShowClinicManagerForm(false); }}>
                                            {showClinicStaffForm ? 'Cancel' : '+ Add Staff'}
                                        </button>
                                    </div>

                                    {/* Staff Form */}
                                    {showClinicStaffForm && (
                                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                                            <h4 style={{ margin: '0 0 4px', color: '#1e293b' }}>Add Staff Login Account</h4>
                                            <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 12px' }}>
                                                Standard tier: 1 Doctor + 1 Receptionist. Upgrade tier first if slots are full.
                                            </p>
                                            <form onSubmit={handleCreateClinicStaff} className="user-form">
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Full Name *</label>
                                                        <input type="text" className="staff-input" placeholder="Staff name" value={clinicStaffForm.name}
                                                            onChange={e => setClinicStaffForm({ ...clinicStaffForm, name: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Email *</label>
                                                        <input type="email" className="staff-input" placeholder="staff@clinic.com" value={clinicStaffForm.email}
                                                            onChange={e => setClinicStaffForm({ ...clinicStaffForm, email: e.target.value })} required />
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Password *</label>
                                                        <input type="text" className="staff-input" placeholder="Temporary password" value={clinicStaffForm.password}
                                                            onChange={e => setClinicStaffForm({ ...clinicStaffForm, password: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Phone</label>
                                                        <input type="text" className="staff-input" placeholder="Phone number" value={clinicStaffForm.phone}
                                                            onChange={e => setClinicStaffForm({ ...clinicStaffForm, phone: e.target.value })} />
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="staff-label">Role *</label>
                                                    <select className="staff-input" value={clinicStaffForm.staffRole}
                                                        onChange={e => setClinicStaffForm({ ...clinicStaffForm, staffRole: e.target.value })}>
                                                        <option value="doctor">🩺 Doctor</option>
                                                        <option value="receptionist">📋 Receptionist</option>
                                                    </select>
                                                </div>
                                                <button type="submit" disabled={savingClinicStaff} className="submit-button">
                                                    {savingClinicStaff ? 'Adding...' : '✅ Add Staff'}
                                                </button>
                                            </form>
                                        </div>
                                    )}

                                    {/* Staff Table */}
                                    {clinicStats.stats.staff?.length > 0 ? (
                                        <div className="users-table">
                                            <table>
                                                <thead>
                                                    <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Added</th><th></th></tr>
                                                </thead>
                                                <tbody>
                                                    {clinicStats.stats.staff.map(s => (
                                                        <tr key={s._id}>
                                                            <td style={{ fontWeight: 600 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1', fontSize: '13px' }}>
                                                                        {s.name?.charAt(0)?.toUpperCase()}
                                                                    </div>
                                                                    {s.name}
                                                                </div>
                                                            </td>
                                                            <td>{s.email}</td>
                                                            <td>{s.phone || '—'}</td>
                                                            <td>
                                                                <span className="role-badge">{String(s.role).toUpperCase()}</span>
                                                            </td>
                                                            <td style={{ color: '#94a3b8', fontSize: '12px' }}>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                                                            <td>
                                                                <button className="btn-confirm-delete" style={{ fontSize: '11px', padding: '4px 8px' }}
                                                                    onClick={() => handleDeleteClinicStaff(s._id)}>Remove</button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No staff added yet. Add a manager or staff member above.</p>
                                    )}
                                </div>

                                {/* Recent Appointments */}
                                {clinicStats.stats.recentAppointments?.length > 0 && (
                                    <div className="admin-card">
                                        <h3>📅 Recent Appointments</h3>
                                        <div className="users-table">
                                            <table>
                                                <thead>
                                                    <tr><th>Patient ID</th><th>Doctor</th><th>Date</th><th>Status</th><th>Amount</th><th>Payment</th></tr>
                                                </thead>
                                                <tbody>
                                                    {clinicStats.stats.recentAppointments.map((a, i) => (
                                                        <tr key={i}>
                                                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.clinicPatientId?.patientUid || a.patientId || '—'}</td>
                                                            <td>{a.doctorName || '—'}</td>
                                                            <td>{a.appointmentDate ? new Date(a.appointmentDate).toLocaleDateString('en-IN') : '—'}</td>
                                                            <td><span className={`status-badge status-${a.status}`}>{a.status}</span></td>
                                                            <td>{formatCurrency(a.amount)}</td>
                                                            <td><span style={{ color: a.paymentStatus === 'paid' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: '12px' }}>{a.paymentStatus}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* ── Subscription / Billing Management ── */}
                                <div className="admin-card" style={{ marginTop: '20px', border: '2px solid #e0e7ff' }}>
                                    <h3 style={{ marginBottom: '4px' }}>💳 Billing &amp; Subscription</h3>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>
                                        Patient code: <strong style={{ color: '#6366f1' }}>{clinicStats.clinic?.clinicCode || '—'}</strong> · Rate per new patient this month
                                    </p>

                                    {/* Set rate form */}
                                    <form onSubmit={handleSaveRate} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '20px', padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Rate per New Patient (₹)</label>
                                            <input type="number" min="0" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', width: '160px' }}
                                                placeholder="e.g. 50" value={subscriptionRateForm.ratePerPatient}
                                                onChange={e => setSubscriptionRateForm(f => ({ ...f, ratePerPatient: e.target.value }))} />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '4px' }}>
                                            <input type="checkbox" id="billingEnabled" checked={subscriptionRateForm.billingEnabled}
                                                onChange={e => setSubscriptionRateForm(f => ({ ...f, billingEnabled: e.target.checked }))} />
                                            <label htmlFor="billingEnabled" style={{ fontSize: '13px', color: '#475569', cursor: 'pointer' }}>Enable billing</label>
                                        </div>
                                        <button type="submit" className="btn-save" style={{ fontSize: '13px', padding: '8px 16px' }} disabled={savingRate}>
                                            {savingRate ? 'Saving...' : '💾 Save Rate'}
                                        </button>
                                    </form>

                                    {/* Subscription history table */}
                                    {clinicSubscriptions.length > 0 ? (
                                        <div className="users-table">
                                            <table>
                                                <thead>
                                                    <tr><th>Month / Year</th><th>New Patients</th><th>Total Patients</th><th>Rate</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
                                                </thead>
                                                <tbody>
                                                    {clinicSubscriptions.map(sub => (
                                                        <tr key={sub._id}>
                                                            <td style={{ fontWeight: 600 }}>{new Date(sub.year, sub.month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</td>
                                                            <td style={{ color: '#6366f1', fontWeight: 600 }}>{sub.newPatientCount}</td>
                                                            <td>{sub.totalPatientCount}</td>
                                                            <td>₹{sub.ratePerPatient}</td>
                                                            <td style={{ fontWeight: 700 }}>₹{sub.totalAmount.toLocaleString('en-IN')}</td>
                                                            <td>
                                                                <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                                                                    background: sub.status === 'paid' ? '#dcfce7' : sub.status === 'waived' ? '#f1f5f9' : '#fef3c7',
                                                                    color: sub.status === 'paid' ? '#16a34a' : sub.status === 'waived' ? '#64748b' : '#92400e' }}>
                                                                    {sub.status.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {sub.status !== 'paid' && (
                                                                    <button className="btn-save" style={{ fontSize: '11px', padding: '4px 10px', marginRight: '4px' }}
                                                                        onClick={() => handleMarkSubscription(sub._id, 'paid')}>Mark Paid</button>
                                                                )}
                                                                {sub.status === 'pending' && (
                                                                    <button className="btn-edit" style={{ fontSize: '11px', padding: '4px 10px' }}
                                                                        onClick={() => handleMarkSubscription(sub._id, 'waived')}>Waive</button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '16px 0', fontSize: '13px' }}>No billing records yet. Records appear once patients are registered.</p>
                                    )}
                                </div>

                                {/* ── Appointment System Mode ── */}
                                <div className="admin-card" style={{ marginTop: '20px', border: '2px solid #e0f2fe' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                        <h3 style={{ margin: 0 }}>🎟️ Appointment System Mode</h3>
                                        <span style={{ fontSize: '0.75rem', background: selectedClinic.appointmentMode === 'token' ? '#fef3c7' : '#dbeafe', color: selectedClinic.appointmentMode === 'token' ? '#92400e' : '#1d4ed8', padding: '2px 10px', borderRadius: '20px', fontWeight: 700 }}>
                                            Current: {selectedClinic.appointmentMode === 'token' ? 'Token Queue' : 'Time Slots'}
                                        </span>
                                    </div>
                                    <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
                                        Choose how patients are managed in this clinic's reception queue.
                                    </p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                        {/* Token Mode Card */}
                                        <label style={{
                                            display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                            border: clinicApptMode === 'token' ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                            background: clinicApptMode === 'token' ? '#fffbeb' : '#f8fafc',
                                            transition: 'all 0.15s'
                                        }}>
                                            <input type="radio" name="clinicApptMode" value="token" checked={clinicApptMode === 'token'} onChange={() => setClinicApptMode('token')} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                <span style={{ fontSize: '2rem', lineHeight: 1 }}>🎟️</span>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: clinicApptMode === 'token' ? '#92400e' : '#1e293b', marginBottom: '4px' }}>
                                                        Token Queue System
                                                        {clinicApptMode === 'token' && <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>Selected</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.83rem', color: '#64748b', lineHeight: 1.5 }}>
                                                        Sequential tokens (1, 2, 3…) per day. Auto-resets at midnight. No time-slot picking needed. Best for walk-in clinics.
                                                    </div>
                                                </div>
                                            </div>
                                        </label>
                                        {/* Slot Mode Card */}
                                        <label style={{
                                            display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                            border: clinicApptMode === 'slot' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                                            background: clinicApptMode === 'slot' ? '#eff6ff' : '#f8fafc',
                                            transition: 'all 0.15s'
                                        }}>
                                            <input type="radio" name="clinicApptMode" value="slot" checked={clinicApptMode === 'slot'} onChange={() => setClinicApptMode('slot')} style={{ display: 'none' }} />
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                <span style={{ fontSize: '2rem', lineHeight: 1 }}>🕐</span>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: clinicApptMode === 'slot' ? '#1d4ed8' : '#1e293b', marginBottom: '4px' }}>
                                                        Time Slot Booking
                                                        {clinicApptMode === 'slot' && <span style={{ marginLeft: '8px', fontSize: '0.75rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>Selected</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.83rem', color: '#64748b', lineHeight: 1.5 }}>
                                                        Patients pick a specific time (09:00, 09:30…). Fixed scheduling with conflict prevention. Best for planned appointments.
                                                    </div>
                                                </div>
                                            </div>
                                        </label>
                                    </div>

                                    {clinicApptMode !== (selectedClinic.appointmentMode || 'token') && (
                                        <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '10px 14px', fontSize: '0.85rem', color: '#713f12', marginBottom: '14px' }}>
                                            ⚠️ You are changing the appointment mode. Existing appointments will not be affected — only new bookings will follow the new mode.
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <button
                                            onClick={handleSaveClinicApptMode}
                                            disabled={savingClinicApptMode || clinicApptMode === (selectedClinic.appointmentMode || 'token')}
                                            style={{
                                                padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none',
                                                borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                                                opacity: (savingClinicApptMode || clinicApptMode === (selectedClinic.appointmentMode || 'token')) ? 0.5 : 1
                                            }}
                                        >
                                            {savingClinicApptMode ? 'Saving…' : 'Save Mode'}
                                        </button>
                                        {clinicApptMode === (selectedClinic.appointmentMode || 'token') && (
                                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>No changes to save</span>
                                        )}
                                    </div>
                                </div>

                                {/* Quick Access Links */}
                                <div className="admin-card" style={{ marginTop: '20px' }}>
                                    <h3>🚀 Clinic Features</h3>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>Staff can access these modules after logging in at <strong>/login</strong></p>
                                    <div className="config-grid">
                                        {[
                                            { icon: '👤', label: 'Patient Registration', desc: 'Register & search patients', bg: '#f0f9ff', color: '#0ea5e9' },
                                            { icon: '🩺', label: 'Doctor Consultation', desc: 'Appointments & prescriptions', bg: '#f5f3ff', color: '#8b5cf6' },
                                            { icon: '💊', label: 'Pharmacy', desc: 'Medicine orders & inventory', bg: '#fff7ed', color: '#f97316' },
                                            { icon: '🧾', label: 'Billing & Payments', desc: 'Invoice & collect payments', bg: '#fefce8', color: '#eab308' },
                                            { icon: '🧪', label: 'Lab Reports', desc: 'Upload & share lab results', bg: '#fdf4ff', color: '#d946ef' },
                                            { icon: '📊', label: 'Analytics', desc: 'Revenue, patients & reports', bg: '#f0fdf4', color: '#22c55e' },
                                        ].map((item, i) => (
                                            <div key={i} className="config-card" style={{ background: item.bg, cursor: 'default' }}>
                                                <div className="config-icon" style={{ color: item.color }}>{item.icon}</div>
                                                <div>
                                                    <h4 style={{ color: item.color, margin: '0 0 4px' }}>{item.label}</h4>
                                                    <p style={{ color: '#888', margin: 0, fontSize: '13px' }}>{item.desc}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="ca-empty"><p>⚠️ Could not load clinic analytics. The clinic may have no data yet.</p></div>
                        )}
                    </div>
                )}

                {/* Delete Clinic Confirm Modal */}
                {deleteClinicConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Delete Simple Clinic?</h3>
                            <p style={{ color: '#dc2626', fontWeight: '600' }}>This will permanently delete the clinic, all staff accounts, and all clinic data. This action CANNOT be undone.</p>
                            <div className="modal-buttons">
                                <button onClick={() => handleDeleteClinic(deleteClinicConfirm)} className="btn-confirm-delete">Delete</button>
                                <button onClick={() => setDeleteClinicConfirm(null)} className="btn-cancel">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ========== REVENUE PLANS TAB ========== */}
                {activeTab === 'revenue-plans' && (
                    <div>
                        <div className="admin-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <h2>💰 Revenue Plans</h2>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Assign a billing model to each hospital or clinic</p>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={() => navigate('/supremeadmin/revenue')}
                                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', border: 'none', padding: '9px 18px', borderRadius: '9px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        📊 View System Analytics
                                    </button>
                                    <button className="btn-edit" onClick={fetchRevenuePlans} style={{ padding: '9px 18px' }}>
                                        ↻ Refresh
                                    </button>
                                </div>
                            </div>

                            {/* Model Legend */}
                            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                                {Object.entries(MODEL_LABELS).map(([key, m]) => (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '10px', background: m.bg, border: `1px solid ${m.color}30` }}>
                                        <span>{m.icon}</span>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: m.color }}>{m.label}</div>
                                            <div style={{ fontSize: '11px', color: '#888' }}>
                                                {key === 'per_patient' && 'Charge per new patient registered monthly'}
                                                {key === 'fixed_monthly' && 'Flat fee every billing cycle'}
                                                {key === 'per_login' && 'Charge per login session (coming soon)'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Search */}
                            <input
                                placeholder="Search hospital or clinic name…"
                                value={revenuePlanSearch}
                                onChange={e => setRevenuePlanSearch(e.target.value)}
                                style={{ width: '100%', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', boxSizing: 'border-box', outline: 'none' }}
                            />

                            {loadingRevenuePlans ? (
                                <p style={{ textAlign: 'center', color: '#888', padding: '24px' }}>Loading revenue plans…</p>
                            ) : revenuePlans.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                                    <p style={{ fontSize: '32px', marginBottom: '8px' }}>💰</p>
                                    <p>No hospitals found. Add hospitals first, then assign revenue plans.</p>
                                    <button className="btn-save" style={{ marginTop: '12px' }} onClick={fetchRevenuePlans}>Load Plans</button>
                                </div>
                            ) : (
                                <div className="users-table">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Name</th>
                                                <th>Type</th>
                                                <th>Revenue Model</th>
                                                <th>Rate / Fee</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {revenuePlans
                                                .filter(h => !revenuePlanSearch || h.name.toLowerCase().includes(revenuePlanSearch.toLowerCase()))
                                                .map((h, i) => {
                                                    const meta = MODEL_LABELS[h.revenueModel] || MODEL_LABELS.per_patient;
                                                    const rateLabel = h.revenueModel === 'per_patient'
                                                        ? `₹${h.subscription?.ratePerPatient || 0}/patient`
                                                        : h.revenueModel === 'fixed_monthly'
                                                            ? `₹${h.revenueConfig?.monthlyFee || 0}/month`
                                                            : `₹${h.revenueConfig?.ratePerLogin || 0}/login`;
                                                    return (
                                                        <tr key={h._id}>
                                                            <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                                                            <td><strong>{h.name}</strong></td>
                                                            <td>
                                                                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: h.clinicType === 'hospital' ? '#eff6ff' : '#f5f3ff', color: h.clinicType === 'hospital' ? '#3b82f6' : '#8b5cf6' }}>
                                                                    {h.clinicType === 'hospital' ? '🏥 Hospital' : '🏪 Clinic'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: meta.bg, color: meta.color }}>
                                                                    {meta.icon} {meta.label.split(' — ')[0]}
                                                                </span>
                                                            </td>
                                                            <td style={{ fontWeight: 600, color: '#374151' }}>{rateLabel}</td>
                                                            <td>
                                                                <button className="btn-edit" style={{ fontSize: '12px', padding: '5px 12px' }}
                                                                    onClick={() => openPlanEditor(h)}>
                                                                    Edit Plan
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* ── Plan Editor Modal ── */}
                        {editingPlan && (
                            <div className="modal-overlay">
                                <div className="modal-content" style={{ maxWidth: '480px', width: '90%' }}>
                                    <h3>💰 Set Revenue Plan — {editingPlan.name}</h3>
                                    <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 20px' }}>
                                        Choose a billing model and set the rate. This determines how your system charges this {editingPlan.clinicType}.
                                    </p>
                                    <form onSubmit={handleSavePlan}>
                                        {/* Model selector */}
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                            {Object.entries(MODEL_LABELS).map(([key, m]) => (
                                                <div
                                                    key={key}
                                                    onClick={() => setPlanForm(f => ({ ...f, revenueModel: key }))}
                                                    style={{ flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${planForm.revenueModel === key ? m.color : '#e2e8f0'}`, background: planForm.revenueModel === key ? m.bg : '#f8fafc', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                                >
                                                    <div style={{ fontSize: '20px', marginBottom: '4px' }}>{m.icon}</div>
                                                    <div style={{ fontSize: '11px', fontWeight: 700, color: planForm.revenueModel === key ? m.color : '#64748b' }}>{m.label.split(' — ')[0]}</div>
                                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{m.label.split(' — ')[1]}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Rate fields based on model */}
                                        {planForm.revenueModel === 'per_patient' && (
                                            <div style={{ marginBottom: '16px' }}>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Rate per Patient (₹)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={planForm.ratePerPatient}
                                                    onChange={e => setPlanForm(f => ({ ...f, ratePerPatient: e.target.value }))}
                                                    placeholder="e.g. 50"
                                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                                                />
                                                <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>Charged per new patient registered each billing cycle.</p>
                                            </div>
                                        )}
                                        {planForm.revenueModel === 'fixed_monthly' && (
                                            <>
                                                <div style={{ marginBottom: '16px' }}>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Monthly Fee (₹)</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={planForm.monthlyFee}
                                                        onChange={e => setPlanForm(f => ({ ...f, monthlyFee: e.target.value }))}
                                                        placeholder="e.g. 2000"
                                                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                                                    />
                                                </div>
                                                <div style={{ marginBottom: '16px' }}>
                                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Billing Cycle</label>
                                                    <select
                                                        value={planForm.billingCycle}
                                                        onChange={e => setPlanForm(f => ({ ...f, billingCycle: e.target.value }))}
                                                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: 'white', boxSizing: 'border-box' }}
                                                    >
                                                        <option value="monthly">Monthly</option>
                                                        <option value="quarterly">Quarterly</option>
                                                        <option value="annual">Annual</option>
                                                    </select>
                                                </div>
                                            </>
                                        )}
                                        {planForm.revenueModel === 'per_login' && (
                                            <div style={{ marginBottom: '16px' }}>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: '#374151' }}>Rate per Login (₹)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={planForm.ratePerLogin}
                                                    onChange={e => setPlanForm(f => ({ ...f, ratePerLogin: e.target.value }))}
                                                    placeholder="e.g. 5"
                                                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                                                />
                                                <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef3c7', border: '1px solid #fde68a', marginTop: '8px' }}>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#92400e', fontWeight: 600 }}>⚠️ Coming Soon — Per Login tracking is not yet active. You can pre-configure the rate.</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="modal-buttons">
                                            <button type="submit" className="btn-save" disabled={savingPlan}>
                                                {savingPlan ? 'Saving…' : '✓ Save Plan'}
                                            </button>
                                            <button type="button" className="btn-cancel" onClick={() => setEditingPlan(null)}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
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
