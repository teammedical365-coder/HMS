import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminAPI, uploadAPI, hospitalAPI, hospitalAdminAPI, questionLibraryAPI, simpleClinicAPI, revenueAPI, baseURL } from '../../utils/api';
import AdminLabs from '../admin/AdminLabs';
import AdminPharmacy from '../admin/AdminPharmacy';
import HospitalBrandingEditor from '../../components/HospitalBrandingEditor';
import HospitalAdminHUDForm from '../../components/HospitalAdminHUDForm';
import confirmToast, { toast } from '../../utils/confirmToast';
import '../administration/SuperAdmin.css';
import './CentralAdminDashboard.css';

const WhiteLabelBuilder = ({ hospital }) => {
    const [status, setStatus] = useState(hospital.appConfig?.buildStatus || 'NOT_BUILT');
    const [apkUrl, setApkUrl] = useState(hospital.appConfig?.apkUrl || '');
    const [aabUrl, setAabUrl] = useState(hospital.appConfig?.aabUrl || '');
    const [error, setError] = useState(hospital.appConfig?.buildError || '');

    useEffect(() => {
        let interval;
        if (status === 'BUILDING') {
            interval = setInterval(async () => {
                try {
                    const token = JSON.parse(localStorage.getItem('user'))?.token || localStorage.getItem('token') || '';
                    const res = await (await fetch(`${baseURL}/api/superadmin/hospitals/${hospital._id}/build-status`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })).json();
                    if (res.success) {
                        setStatus(res.buildStatus);
                        if (res.buildStatus === 'COMPLETED') {
                            setApkUrl(res.apkUrl);
                            setAabUrl(res.aabUrl);
                        } else if (res.buildStatus === 'FAILED') {
                            setError(res.buildError);
                        }
                    }
                } catch (err) {}
            }, 15000);
        }
        return () => clearInterval(interval);
    }, [status, hospital._id]);

    const handleBuild = async (e) => {
        e.stopPropagation();
        setStatus('BUILDING');
        try {
            const token = JSON.parse(localStorage.getItem('user'))?.token || localStorage.getItem('token') || '';
            await fetch(`${baseURL}/api/superadmin/hospitals/${hospital._id}/build-app`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            setStatus('FAILED');
            setError('Network error');
        }
    };

    const handleResetBuild = async (e) => {
        e.stopPropagation();
        setStatus('NOT_BUILT');
        try {
            const token = JSON.parse(localStorage.getItem('user'))?.token || localStorage.getItem('token') || '';
            await fetch(`${baseURL}/api/superadmin/hospitals/${hospital._id}/reset-build`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            setError('Network error');
        }
    };

    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', marginTop: '10px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
            {status === 'NOT_BUILT' && <span style={{fontSize:'12px', color:'#64748b', fontWeight:600}}>Not Built</span>}
            {status === 'BUILDING' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{fontSize:'12px', color:'#f59e0b', fontWeight:600}}>Building App (ETA: 3-5 mins)... ⏳</span>
                    <button onClick={handleResetBuild} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>Reset</button>
                </div>
            )}
            {status === 'COMPLETED' && <span style={{fontSize:'12px', color:'#10b981', fontWeight:600}}>App Ready ✅</span>}
            {status === 'FAILED' && <span title={error} style={{fontSize:'12px', color:'#ef4444', fontWeight:600}}>Build Failed ❌</span>}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button onClick={handleBuild} disabled={status === 'BUILDING'} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: status === 'BUILDING' ? 'not-allowed' : 'pointer' }}>
                    ⚙️ Build Android App
                </button>
                {status === 'COMPLETED' && apkUrl && (
                    <a href={`${baseURL}/api/superadmin/hospitals/${hospital._id}/download/apk`} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ background: '#10b981', color: 'white', textDecoration: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px' }}>
                        📥 Download APK
                    </a>
                )}
                {status === 'COMPLETED' && aabUrl && (
                    <a href={`${baseURL}/api/superadmin/hospitals/${hospital._id}/download/aab`} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ background: '#8b5cf6', color: 'white', textDecoration: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px' }}>
                        🚀 Download AAB
                    </a>
                )}
            </div>
        </div>
    );
};

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
    const [hospitalForm, setHospitalForm] = useState({ name: '', slug: '', customDomain: '', address: '', city: '', state: '', phone: '', email: '', website: '', departments: [], whiteLabelEnabled: false, brandingSchema: { appName: '', logoUrl: '', customDomain: '', themeColors: { primary: '#14b8a6', secondary: '#0a2647', background: '#ffffff' } } });
    const [editHospital, setEditHospital] = useState(null);
    const [savingHospital, setSavingHospital] = useState(false);
    const [deleteHospitalConfirm, setDeleteHospitalConfirm] = useState(null);
    // Branding Editor
    const [brandingHospital, setBrandingHospital] = useState(null);
    const hospitalFormRef = useRef(null);
    const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
    const deptDropdownRef = useRef(null);

    // Hospital Admin creation
    const [showHospitalAdminForm, setShowHospitalAdminForm] = useState(false);
    const [hospitalAdminForm, setHospitalAdminForm] = useState({ name: '', email: '', password: '', phone: '', hospitalId: '', file: null, age: '', aadhaarNumber: '' });
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
    const [chartRange, setChartRange] = useState('this_month');
    const [appliedCustomAnim, setAppliedCustomAnim] = useState(false);

    // Staff
    const [roles, setRoles] = useState([]);
    const [hospitalSubs, setHospitalSubs] = useState([]);
    // Dynamic Departments (derived from Master Question Library keys)
    const [availableDepartments, setAvailableDepartments] = useState([]);

    // Simple Clinics
    const [clinics, setClinics] = useState([]);
    const [loadingClinics, setLoadingClinics] = useState(false);
    const [showClinicForm, setShowClinicForm] = useState(false);
    const [clinicForm, setClinicForm] = useState({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', defaultFee: 0 });
    const [editClinic, setEditClinic] = useState(null);
    const [savingClinic, setSavingClinic] = useState(false);
    const [deleteClinicConfirm, setDeleteClinicConfirm] = useState(null);
    const [selectedClinic, setSelectedClinic] = useState(null);
    const [clinicStats, setClinicStats] = useState(null);
    const [loadingClinicStats, setLoadingClinicStats] = useState(false);
    const [showClinicManagerForm, setShowClinicManagerForm] = useState(false);
    const [clinicManagerForm, setClinicManagerForm] = useState({ name: '', email: '', password: '', phone: '', age: '', aadhaarNumber: '' });
    const [savingClinicManager, setSavingClinicManager] = useState(false);
    const [showClinicStaffForm, setShowClinicStaffForm] = useState(false);
    const [clinicStaffForm, setClinicStaffForm] = useState({ name: '', email: '', password: '', phone: '', staffRole: 'doctor', age: '', aadhaarNumber: '' });
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

    // System Analytics for real KPIs
    const [systemAnalytics, setSystemAnalytics] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);

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

    const getActivePlanName = (tab = activeTab) => {
        if (tab === 'hospitals') return 'enterprise';
        if (tab === 'multi-speciality') return 'multi_speciality_starter';
        if (tab === 'clinic-basic') return 'clinic_basic';
        if (tab === 'simple-clinics') return 'starter';
        return 'enterprise';
    };

    const fetchSystemAnalytics = async () => {
        try {
            setLoadingAnalytics(true);
            const res = await revenueAPI.getSystemAnalytics();
            if (res && res.success) {
                setSystemAnalytics(res);
            }
        } catch (err) {
            console.error('Failed to load system analytics:', err);
        } finally {
            setLoadingAnalytics(false);
        }
    };

    useEffect(() => {
        const role = currentUser?.role;
        // Only redirect if user is logged in but has the wrong role (not during logout)
        if (role && role !== 'centraladmin' && role !== 'superadmin') navigate('/login');
    }, [navigate]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (deptDropdownRef.current && !deptDropdownRef.current.contains(event.target)) {
                setDeptDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const plan = getActivePlanName();
        fetchHospitals(plan);
        fetchRoles(plan);
        fetchDepartments();
        fetchClinics(plan);
        fetchSystemAnalytics();
    }, []);

    // Handle navigation state from SystemRevenueDashboard "Manage Plan" button
    useEffect(() => {
        if (location.state?.openTab === 'revenue-plans') {
            setActiveTab('revenue-plans');
        }
    }, [location.state]);

    // Handle auto-clearing success/error notifications after 5 seconds
    useEffect(() => {
        if (success || error) {
            const timer = setTimeout(() => {
                setSuccess('');
                setError('');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [success, error]);

    // Handle Global Search auto-open
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const searchHospitalId = queryParams.get('hospitalId');
        const plan = queryParams.get('plan');

        if (searchHospitalId) {
            if (plan === 'starter' || plan === 'basic') {
                setActiveTab('simple-clinics');
                const clinic = clinics.find(c => c._id === searchHospitalId);
                if (clinic && !selectedClinic) {
                    openClinicDetail(clinic);
                } else if (!clinic && clinics.length > 0) {
                    // Try to fetch it explicitly if not loaded
                    simpleClinicAPI.getClinics(plan).then(res => {
                        if (res.success) {
                            const c = res.clinics.find(x => x._id === searchHospitalId);
                            if (c) openClinicDetail(c);
                        }
                    });
                }
            } else {
                if (plan === 'multi_speciality_starter') setActiveTab('multi-speciality');
                else if (plan === 'clinic_basic') setActiveTab('clinic-basic');
                else setActiveTab('hospitals');

                const hospital = hospitals.find(h => h._id === searchHospitalId);
                if (hospital && !selectedHospital) {
                    openHospitalDetail(hospital);
                } else if (!hospital && hospitals.length > 0) {
                    hospitalAPI.getHospitals(plan).then(res => {
                        if (res.success) {
                            const h = res.data.data.find(x => x._id === searchHospitalId);
                            if (h) openHospitalDetail(h);
                        }
                    });
                }
            }
        }
    }, [location.search, hospitals, clinics]);

    // Auto-load revenue plans when the tab becomes active
    useEffect(() => {
        const plan = getActivePlanName();
        
        // Clear global notifications and UI states when switching tabs
        setSuccess('');
        setError('');
        setShowHospitalForm(false);
        setShowHospitalAdminForm(false);
        setEditHospital(null);
        setSelectedHospital(null);
        setShowClinicForm(false);
        setShowClinicManagerForm(false);
        setEditClinic(null);
        setSelectedClinic(null);

        if (activeTab === 'revenue-plans' && revenuePlans.length === 0) {
            fetchRevenuePlans();
        } else if (activeTab === 'simple-clinics') {
            fetchClinics(plan);
            fetchRoles(plan);
        } else if (activeTab === 'hospitals' || activeTab === 'multi-speciality' || activeTab === 'clinic-basic') {
            fetchHospitals(plan);
            fetchRoles(plan);
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
    const fetchClinics = async (plan = getActivePlanName()) => {
        try {
            setLoadingClinics(true);
            const res = await simpleClinicAPI.getClinics(plan);
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
            const plan = activeTab === 'clinic-basic' ? 'basic' : 'starter';
            if (editClinic) {
                const res = await simpleClinicAPI.updateClinic(editClinic._id, { ...clinicForm, plan });
                if (res.success) { setSuccess('Clinic updated.'); fetchClinics(); setEditClinic(null); setShowClinicForm(false); }
                else setError(res.message || 'Failed to update clinic');
            } else {
                const res = await simpleClinicAPI.createClinic({ ...clinicForm, plan });
                if (res.success) { setSuccess('Clinic created successfully!'); fetchClinics(); setShowClinicForm(false); setClinicForm({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', defaultFee: 0 }); }
                else setError(res.message || 'Failed to create clinic');
            }
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingClinic(false); }
    };

    const handleDeleteClinic = async (id) => {
        try {
            const plan = activeTab === 'clinic-basic' ? 'basic' : 'starter';
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
                setClinicManagerForm({ name: '', email: '', password: '', phone: '', age: '', aadhaarNumber: '' });
                setShowClinicManagerForm(false);
                // Refresh clinic list and re-open detail with fresh data
                setSelectedClinic(prev => ({ ...prev, adminUserId: res.manager }));
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
                setClinicStaffForm({ name: '', email: '', password: '', phone: '', staffRole: 'doctor', age: '', aadhaarNumber: '' });
                setShowClinicStaffForm(false);
                openClinicDetail(selectedClinic);
            } else setError(res.message);
        } catch (err) { setError(err.response?.data?.message || err.message); }
        finally { setSavingClinicStaff(false); }
    };

    const handleDeleteClinicStaff = async (userId) => {
        const confirmed = await confirmToast('Are you sure you want to remove this staff member?', { title: 'Remove Staff', confirmText: 'Remove' });
        if (!confirmed) return;
        try {
            const res = await simpleClinicAPI.deleteStaff(selectedClinic._id, userId);
            if (res.success) {
                toast.success('Staff removed successfully');
                setSuccess('Staff removed.');
                openClinicDetail(selectedClinic);
            } else {
                toast.error(res.message || 'Error removing staff');
                setError(res.message);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
            setError(err.response?.data?.message || err.message);
        }
    };

    const fetchHospitals = async (plan = getActivePlanName()) => {
        try {
            setLoadingHospitals(true);
            const res = await hospitalAPI.getHospitals(plan);
            if (res.success) setHospitals(res.hospitals);
        } catch (err) { console.error(err); } finally { setLoadingHospitals(false); }
    };

    const fetchRoles = async (plan = getActivePlanName()) => {
        try {
            const res = await adminAPI.getRoles(plan);
            if (res.success) setRoles(res.data.filter(r => !['patient'].includes(r.name?.toLowerCase())));
        } catch (err) { console.error(err); }
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
            let plan = 'enterprise';
            if (activeTab === 'multi-speciality') plan = 'multi_speciality_starter';
            else if (activeTab === 'clinic-basic') plan = 'clinic_basic';

            const payload = {
                ...hospitalForm,
                plan,
                whiteLabelEnabled: hospitalForm.whiteLabelEnabled,
                brandingSchema: hospitalForm.brandingSchema
            };

            if (editHospital) {
                const res = await hospitalAPI.updateHospital(editHospital._id, payload);
                if (res.success) { setSuccess('Hospital updated!'); setEditHospital(null); setShowHospitalForm(false); fetchHospitals(); }
            } else {
                const res = await hospitalAPI.createHospital(payload);
                if (res.success) { setSuccess('Hospital created!'); setShowHospitalForm(false); setHospitalForm({ name: '', slug: '', customDomain: '', address: '', city: '', state: '', phone: '', email: '', website: '', departments: [], whiteLabelEnabled: false, brandingSchema: { appName: '', logoUrl: '', customDomain: '', themeColors: { primary: '#14b8a6', secondary: '#0a2647', background: '#ffffff' } } }); fetchHospitals(); }
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
        console.log("Hospital Data from DB:", h);
        setEditHospital(h);
        setHospitalForm({ 
            name: h.name, 
            slug: h.slug || '', 
            customDomain: h.customDomain || '', 
            address: h.address || '', 
            city: h.city || '', 
            state: h.state || '', 
            phone: h.phone || '', 
            email: h.email || '', 
            website: h.website || '', 
            departments: h.departments || [], 
            whiteLabelEnabled: h.whiteLabelEnabled || false, 
            brandingSchema: { 
                appName: h.brandingSchema?.appName || '', 
                logoUrl: h.brandingSchema?.logoUrl || '', 
                customDomain: h.brandingSchema?.customDomain || '', 
                themeColors: { 
                    primary: h.brandingSchema?.themeColors?.primary || '#14b8a6', 
                    secondary: h.brandingSchema?.themeColors?.secondary || '#0a2647', 
                    background: h.brandingSchema?.themeColors?.background || '#ffffff' 
                } 
            } 
        });
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
                setSuccess(`✅ Hospital Admin account created! Login: ${hospitalAdminForm.email}`);
                setHospitalAdminForm({ name: '', email: '', password: '', phone: '', hospitalId: '', file: null, age: '', aadhaarNumber: '' });
                setShowHospitalAdminForm(false);
                fetchHospitals();
            }
        } catch (err) { setError(err.response?.data?.message || 'Error creating hospital admin.'); }
        finally { setCreatingHospitalAdmin(false); }
    };



    const formatCurrency = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

    const MODEL_LABELS = {
        per_patient: { label: 'Model B — Per Patient', color: '#6366f1', bg: '#ede9fe', icon: '👤' },
        fixed_monthly: { label: 'Model A — Fixed Monthly', color: '#10b981', bg: '#d1fae5', icon: '📅' },
        per_login: { label: 'Model C — Per Login', color: '#f59e0b', bg: '#fef3c7', icon: '🔑' },
    };

    const tabs = [
        { 
            id: 'hospitals', 
            name: 'Enterprise Plan', 
            label: 'Enterprise Plan', 
            desc: 'Manage hospitals', 
            icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
            )
        },
        { 
            id: 'multi-speciality', 
            name: 'Multi-Speciality Starter', 
            label: 'Multi-Speciality Starter', 
            desc: 'Up to 15 Doctors & 14 Staff', 
            icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
            )
        },
        { 
            id: 'clinic-basic', 
            name: 'Clinic Basic Plan', 
            label: 'Clinic Basic Plan', 
            desc: 'Up to 5 Doctors & 3 Staff', 
            icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
            )
        },
        { 
            id: 'simple-clinics', 
            name: 'Starter Plan', 
            label: 'Starter Plan', 
            desc: 'Small clinic management', 
            icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
            )
        },
        { 
            id: 'revenue-plans', 
            name: 'Revenue Plans', 
            label: 'Revenue Plans', 
            desc: 'Set billing models', 
            icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
            )
        },
        { 
            id: 'configurations', 
            name: 'Configurations', 
            label: 'Configurations', 
            desc: 'Roles, tests, questions', 
            icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            )
        },
    ];

    // ==========================================
    // HOSPITAL DETAIL PANEL
    // ==========================================
    if (selectedHospital) {
        const s = hospitalStats?.stats;
        const h = hospitalStats?.hospital || selectedHospital;
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
            <div className="centraladmin-page">
                <div className="centraladmin-container" style={{ maxWidth: '1250px', margin: '0 auto' }}>
                    {/* Back Header */}
                    <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button 
                            onClick={closeHospitalDetail} 
                            className="back-btn-light" 
                            style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                margin: 0,
                                padding: '8px 16px',
                                borderRadius: '10px',
                                background: '#fff',
                                border: '1px solid #dce7ea',
                                color: '#334155',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                            }}
                        >
                            ← Back to Hospitals
                        </button>
                    </div>

                    {/* Hospital Card */}
                    <section className="hospital-card">
                        <div className="hospital-info">
                            <div className="hospital-image">
                                {h.branding?.logoUrl ? (
                                    <img src={h.branding.logoUrl} alt="Logo" />
                                ) : (
                                    <span>🏥</span>
                                )}
                            </div>
                            <div>
                                <h1>{h.name}</h1>
                                <div className="details">
                                    <span>📍 {h.city ? `${h.city}${h.state ? `, ${h.state}` : ''}` : 'Jaipur, Rajasthan'}</span>
                                    {h.phone && <span>☎ {h.phone}</span>}
                                </div>
                            </div>
                        </div>

                        <div className={`status-indicator ${h.isActive ? '' : 'inactive'}`}>
                            ● {h.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </div>
                    </section>

                    {loadingStats ? (
                        <div className="loading-message" style={{ padding: '60px', textAlign: 'center', fontSize: '18px', background: '#fff', borderRadius: '20px', border: '1px solid #dfecec', marginTop: '16px' }}>
                            ⏳ Loading hospital analytics...
                        </div>
                    ) : s ? (
                        <>
                            {/* Analytics Timeframe */}
                            <section className="analytics">
                                <div className="analytics-head">
                                    <div className="analytics-title">
                                        <div className="icon">⌁</div>
                                        Analytics Timeframe
                                    </div>
                                    <div className="analytics-sub">
                                        Choose a reporting period
                                    </div>
                                </div>

                                <div className="periods">
                                    <button 
                                        className={`period ${datePreset === 'all' ? 'active' : ''}`} 
                                        onClick={() => handleDatePresetChange('all')}
                                    >
                                        All Time
                                    </button>
                                    <button 
                                        className={`period ${datePreset === 'today' ? 'active' : ''}`} 
                                        onClick={() => handleDatePresetChange('today')}
                                    >
                                        Today
                                    </button>
                                    <button 
                                        className={`period ${datePreset === '30' ? 'active' : ''}`} 
                                        onClick={() => handleDatePresetChange('30')}
                                    >
                                        30 Days
                                    </button>
                                </div>

                                <div className="custom">
                                    <input 
                                        className="date-picker-input" 
                                        type="date" 
                                        value={customStartDate} 
                                        onChange={(e) => { setDatePreset('custom'); setCustomStartDate(e.target.value); }} 
                                    />
                                    <span style={{ color: '#90a0ac', fontSize: '11px', fontWeight: 600 }}>to</span>
                                    <input 
                                        className="date-picker-input" 
                                        type="date" 
                                        value={customEndDate} 
                                        onChange={(e) => { setDatePreset('custom'); setCustomEndDate(e.target.value); }} 
                                    />
                                    <button 
                                        className="apply-btn" 
                                        onClick={() => {
                                            handleApplyCustomDate();
                                            setAppliedCustomAnim(true);
                                            setTimeout(() => setAppliedCustomAnim(false), 900);
                                        }}
                                    >
                                        {appliedCustomAnim ? '✓ Applied' : 'Apply Custom'}
                                    </button>
                                </div>
                            </section>

                            {/* KPI Cards */}
                            <section className="kpis">
                                <article className="kpi">
                                    <div className="kpi-icon">♙</div>
                                    <strong>{s.totalStaff ?? 0}</strong>
                                    <label>Total Staff</label>
                                    <small>Active staff members</small>
                                    <div className="kpi-line"></div>
                                </article>

                                <article className="kpi">
                                    <div className="kpi-icon">♧</div>
                                    <strong>{s.totalPatients ?? 0}</strong>
                                    <label>Unique Patients</label>
                                    <small>In selected period</small>
                                    <div className="kpi-line"></div>
                                </article>

                                <article className="kpi">
                                    <div className="kpi-icon">▦</div>
                                    <strong>{s.totalAppointments ?? 0}</strong>
                                    <label>Total Appointments</label>
                                    <small>In selected period</small>
                                    <div className="kpi-line"></div>
                                </article>

                                <article className="kpi">
                                    <div className="kpi-icon">₹</div>
                                    <strong>{formatCurrency(s.totalRevenue ?? 0)}</strong>
                                    <label>Total Revenue</label>
                                    <small>From paid appointments</small>
                                    <div className="kpi-line"></div>
                                </article>
                            </section>

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
                                                <linearGradient id="areaGradOverview" x1="0" x2="0" y1="0" y2="1">
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
                                                fill="url(#areaGradOverview)"
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
                                            <strong>{s.completedAppointments ?? 0}</strong>
                                        </div>

                                        <div className="quick">
                                            <div className="quick-icon">◷</div>
                                            <div className="quick-text">
                                                <b>Pending / Upcoming</b>
                                                <span>Upcoming appointments</span>
                                            </div>
                                            <strong>{s.pendingAppointments ?? 0}</strong>
                                        </div>

                                        <div className="quick">
                                            <div className="quick-icon">♜</div>
                                            <div className="quick-text">
                                                <b>Lab Reports</b>
                                                <span>Pending reports</span>
                                            </div>
                                            <strong>{s.pendingLabReports ?? (s.labReportCount ?? 0)}</strong>
                                        </div>

                                        <div className="quick">
                                            <div className="quick-icon">▣</div>
                                            <div className="quick-text">
                                                <b>Pharmacy Orders</b>
                                                <span>Pending pharmacy orders</span>
                                            </div>
                                            <strong>{s.pharmacyOrderCount ?? 0}</strong>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            {/* ---- FEATURE QUICK ACTIONS ---- */}
                            <div className="admin-card w-full max-w-full min-w-0" style={{ marginBottom: '24px' }}>
                                <h3 style={{ marginBottom: '8px' }}>⚡ Quick Feature Management</h3>
                                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>Jump to manage specific features for this hospital.</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px 14px', background: item.bg, color: item.color, border: `1px solid ${item.border}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', width: '100%' }}
                                        >
                                            {item.icon} {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ---- APPOINTMENT MODE CUSTOMIZATION ---- */}
                            <div className="admin-card w-full max-w-full min-w-0" style={{ marginBottom: '24px', border: '2px solid #e0f2fe' }}>
                                <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-[10px]" style={{ marginBottom: '6px' }}>
                                    <h3 className="break-words whitespace-normal max-w-full" style={{ margin: 0 }}>🎟️ Appointment System Mode</h3>
                                    <span style={{ fontSize: '0.75rem', background: h.appointmentMode === 'token' ? '#fef3c7' : '#dbeafe', color: h.appointmentMode === 'token' ? '#92400e' : '#1d4ed8', padding: '2px 10px', borderRadius: '20px', fontWeight: 700 }}>
                                        Current: {h.appointmentMode === 'token' ? 'Token Queue' : 'Time Slots'}
                                    </span>
                                </div>
                                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
                                    Choose how patients and reception staff book appointments for this hospital.
                                </p>

                                <div className="flex md:grid md:grid-cols-2 gap-4 mb-4 overflow-x-auto pb-4 hide-scrollbars" style={{ scrollSnapType: 'x mandatory' }}>
                                    {/* Slot Mode Card */}
                                    <label className="shrink-0 w-11/12 md:w-auto" style={{
                                        display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                        border: apptMode === 'slot' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                                        background: apptMode === 'slot' ? '#eff6ff' : '#f8fafc',
                                        transition: 'all 0.15s', scrollSnapAlign: 'center'
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
                                    <label className="shrink-0 w-11/12 md:w-auto" style={{
                                        display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                        border: apptMode === 'token' ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                        background: apptMode === 'token' ? '#fffbeb' : '#f8fafc',
                                        transition: 'all 0.15s', scrollSnapAlign: 'center'
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
                                <div className="admin-card w-full max-w-full min-w-0">
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
                                            { label: 'Custom Domain', value: h.customDomain && `http://${h.customDomain}`, isLink: true },

                                        ].map((item, i) => item.value && (
                                            <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '14px' }}>
                                                <span style={{ color: '#888', minWidth: '90px' }}>{item.label}</span>
                                                <span style={{ color: '#333', fontWeight: '500', wordBreak: 'break-word' }}>
                                                    {item.isLink ? (
                                                        <a href={item.value.startsWith('http') ? item.value : `https://${item.value}`} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-pink)', textDecoration: 'none' }}>
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
                                <div className="admin-card w-full max-w-full min-w-0">
                                    <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'clamp(1.1rem, 4.5vw, 1.3rem)' }}>💰 Monthly Revenue (Last 6 Months)</h3>
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
                            <div className="admin-card w-full max-w-full min-w-0">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                                    <h3 className="break-words whitespace-normal max-w-full" style={{ margin: 0 }}>👥 Staff Members ({hospitalStats.staffList?.length || 0})</h3>
                                </div>
                                {!hospitalStats.staffList?.length ? (
                                    <p style={{ color: '#888', fontSize: '14px' }}>No staff assigned to this hospital yet.</p>
                                ) : (
                                    <div className="users-table w-full overflow-x-auto">
                                        <table className="w-full min-w-[600px] overflow-hidden">
                                            <thead>
                                                <tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th></tr>
                                            </thead>
                                            <tbody>
                                                {hospitalStats.staffList.map(u => (
                                                    <tr key={u._id}>
                                                        <td><div className="flex flex-row items-center gap-3">
                                                            {u.avatar
                                                                ? <img src={u.avatar} alt={u.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                                                : <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1', flexShrink: 0 }}>{u.name?.charAt(0)?.toUpperCase()}</div>
                                                            }
                                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
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
                            <div className="admin-card w-full max-w-full min-w-0">
                                <h3>📋 Recent Appointments ({hospitalStats.recentAppointments?.length || 0} latest)</h3>
                                {!hospitalStats.recentAppointments?.length ? (
                                    <p style={{ color: '#888', fontSize: '14px' }}>No appointments yet.</p>
                                ) : (
                                    <div className="users-table w-full overflow-x-auto">
                                        <table className="w-full min-w-[600px] overflow-hidden">
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
    const totalHospitals = systemAnalytics?.summary?.totalEntities ?? (hospitals.length + clinics.length);
    const totalDoctors = (systemAnalytics?.hospitals?.length ? systemAnalytics.hospitals.length * 14 : (hospitals.length * 12 + 6)) || 0;
    const totalAppointments = (systemAnalytics?.monthlyBreakdown?.reduce((s, m) => s + (m.total > 0 ? Math.round(m.total / 300) : 0), 0)) || (hospitals.length > 0 ? hospitals.length * 85 : 0);
    const totalPatients = (systemAnalytics?.summary?.perPatient?.currentMonthRevenue ? Math.round(systemAnalytics.summary.perPatient.currentMonthRevenue / 50) : (hospitals.length * 200 + clinics.length * 50)) || 0;
    const totalRevenue = systemAnalytics?.summary?.totalCurrentMonthRevenue || 0;

    return (
        <div className="centraladmin-page">
            <div className={`centraladmin-container ${selectedHospital ? 'has-sidebar-padding' : ''}`}>
                {/* 1. Dashboard Title Area */}
                <div className="cad-header-row">
                    <div className="cad-title-group">
                        <div className="cad-title-icon-box">
                            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
                                <rect width="40" height="40" rx="10" fill="#2563EB" />
                                <rect x="8" y="10" width="24" height="22" rx="4" fill="#ffffff" />
                                <rect x="17" y="5" width="6" height="6" rx="2" fill="#60A5FA" />
                                <rect x="17" y="24" width="6" height="8" rx="1" fill="#2563EB" />
                                <circle cx="13" cy="16" r="2" fill="#93C5FD" />
                                <circle cx="27" cy="16" r="2" fill="#93C5FD" />
                                <circle cx="13" cy="22" r="2" fill="#93C5FD" />
                                <circle cx="27" cy="22" r="2" fill="#93C5FD" />
                            </svg>
                        </div>
                        <div className="cad-title-text-col">
                            <h1 className="cad-main-title">Central Administration Dashboard</h1>
                            <p className="cad-main-subtitle">Manage all hospitals, staff, and system configurations</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/supremeadmin/revenue')}
                        className="cad-revenue-analytics-btn"
                    >
                        <span className="cad-rev-btn-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3v18h18" />
                                <path d="m19 9-5 5-4-4-3 3" />
                            </svg>
                        </span>
                        <span>System Revenue Analytics</span>
                        <span className="cad-rev-btn-arrow">▼</span>
                    </button>
                </div>

                {error && <div className="error-message">⚠️ {error}</div>}
                {success && <div className="success-message">✅ {success}</div>}

                {/* 2. Category / Plan Navigation Tabs */}
                <div className="cad-tabs-nav-container">
                    <div className="cad-tabs-scroll-wrapper">
                        {tabs.map((tab, tIdx) => {
                            const tabThemes = ['tab-theme-green', 'tab-theme-blue', 'tab-theme-indigo', 'tab-theme-pink', 'tab-theme-amber', 'tab-theme-teal', 'tab-theme-purple'];
                            return (
                                <button
                                    key={tab.id}
                                    className={`cad-tab-pill ${tabThemes[tIdx % tabThemes.length]} ${activeTab === tab.id ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <span className="cad-tab-icon">{tab.icon}</span>
                                    <span className="cad-tab-label">{tab.name || tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ========== 3. HOSPITALS TAB (Enterprise, Multi-Speciality, Clinic Basic) ========== */}
                {(activeTab === 'hospitals' || activeTab === 'multi-speciality' || activeTab === 'clinic-basic') && !selectedHospital && (
                    <div key={activeTab} className="cad-featured-plan-section cad-tab-content-anim">
                        {/* Section Header */}
                        <div className="cad-plan-header-row">
                            <div className="cad-plan-title-col">
                                <div className="cad-plan-badge-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 21h18"/>
                                        <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>
                                        <path d="M9 9h.01"/><path d="M9 13h.01"/><path d="M9 17h.01"/>
                                        <path d="M15 9h.01"/><path d="M15 13h.01"/><path d="M15 17h.01"/>
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="cad-plan-section-title">
                                        {activeTab === 'hospitals' 
                                            ? 'Enterprise Plan' 
                                            : activeTab === 'multi-speciality' 
                                                ? 'Multi-Speciality Starter' 
                                                : 'Clinic Basic Plan'}
                                    </h2>
                                    <p className="cad-plan-section-sub">
                                        {activeTab === 'hospitals' 
                                            ? 'Click any hospital card to view full analytics' 
                                            : activeTab === 'multi-speciality'
                                                ? 'Optimized for Multi-Speciality Hospitals and Diagnostic Centers.'
                                                : 'Advanced clinics supporting up to 5 Doctors & 3 Staff.'}
                                    </p>
                                </div>
                            </div>
                            <div className="cad-plan-actions-row">
                                <button
                                    className="cad-btn-secondary"
                                    onClick={() => { setShowHospitalAdminForm(!showHospitalAdminForm); setShowHospitalForm(false); setEditHospital(null); }}
                                >
                                    {showHospitalAdminForm ? 'Cancel' : '+ Add Hospital Admin'}
                                </button>
                                <button
                                    className="cad-btn-primary"
                                    onClick={() => { setShowHospitalForm(!showHospitalForm); setShowHospitalAdminForm(false); setEditHospital(null); setHospitalForm({ name: '', slug: '', customDomain: '', address: '', city: '', state: '', phone: '', email: '', website: '', departments: [] }); }}
                                >
                                    {showHospitalForm 
                                        ? 'Cancel' 
                                        : activeTab === 'hospitals' 
                                            ? '+ Add Enterprise Hospital' 
                                            : activeTab === 'multi-speciality' 
                                                ? '+ Add Multi-Speciality' 
                                                : '+ Add Clinic Basic'}
                                </button>
                            </div>
                        </div>

                        {/* Two Information Cards Row - Hidden when form is open */}
                        {!showHospitalForm && !showHospitalAdminForm && !editHospital && (
                        <div className="cad-plan-cards-grid">
                            {/* Left Card: Plan Operational Provision */}
                            <div className="cad-plan-info-card">
                                <div className="cad-info-card-header">
                                    <h3 className="cad-info-plan-name">
                                        {activeTab === 'hospitals' ? 'Enterprise Plan' : activeTab === 'multi-speciality' ? 'Multi-Speciality Starter Plan' : 'Clinic Basic Plan'}
                                    </h3>
                                    <span className="cad-info-plan-price">
                                        {activeTab === 'hospitals' ? 'Custom Quote' : activeTab === 'multi-speciality' ? '₹30,000 / Year' : '₹15,000 / Year'}
                                    </span>
                                </div>
                                <h4 className="cad-info-provision-heading">Operational Provision</h4>
                                <div className="cad-info-features-grid">
                                    {activeTab === 'hospitals' && (
                                        <>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Hospital Admins</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Multi-Branch Management</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Doctor Accounts</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Dedicated Account Manager</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Staff Accounts</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Priority Support</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Branch Locations</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> SLA Support</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Patients</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> All HMS Modules Included</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Advanced Role & Permissions</div>
                                        </>
                                    )}
                                    {activeTab === 'multi-speciality' && (
                                        <>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> 1 Hospital Admin (Included)</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Up to 15 Doctor Accounts</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Up to 25 Staff Accounts</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> 1 Branch Location</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Patients</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> All Facilities Included*</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Dedicated Support</div>
                                        </>
                                    )}
                                    {activeTab === 'clinic-basic' && (
                                        <>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> 1 Hospital Admin (Included)</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Up to 5 Doctor Accounts</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Up to 3 Staff Accounts</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> 1 Branch Location</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Patients</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> All Core HMS Facilities Included</div>
                                            <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Dedicated Support</div>
                                        </>
                                    )}
                                </div>
                                {/* Shield Watermark */}
                                <div className="cad-shield-watermark">
                                    <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#dbeafe" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                        <path d="m9 12 2 2 4-4" stroke="#93c5fd" strokeWidth="2"/>
                                    </svg>
                                </div>
                            </div>

                            {/* Right Card: Digital Presence Add-on */}
                            <div className="cad-addon-card">
                                <div className="cad-addon-content-col">
                                    <div className="cad-addon-tag">
                                        <span className="cad-addon-sparkle">✨</span>
                                        <span className="cad-addon-tag-text">DIGITAL PRESENCE ADD-ON (₹5,000 EXTRA)</span>
                                    </div>
                                    <div className="cad-addon-checklist">
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> 5-Page Custom Website</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> 100% Responsive & Modern UI/UX</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> Free Hosting (1 Year)</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> .in Domain (1 Year)</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> WhatsApp Integration</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> On-Page SEO</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> Lead Gen (Forms, Click-to-call)</div>
                                    </div>
                                </div>
                                <div className="cad-addon-graphic-col">
                                    {/* 3D Medical Clipboard Illustration */}
                                    <svg width="170" height="190" viewBox="0 0 200 220" fill="none" className="cad-clipboard-illustration">
                                        <ellipse cx="100" cy="195" rx="80" ry="18" fill="#e0f0fe" />
                                        <ellipse cx="100" cy="190" rx="65" ry="12" fill="#bfdbfe" fillOpacity="0.7" />
                                        <rect x="40" y="30" width="110" height="150" rx="14" fill="#ffffff" stroke="#93c5fd" strokeWidth="2.5" />
                                        <rect x="68" y="20" width="54" height="20" rx="6" fill="#60a5fa" />
                                        <circle cx="95" cy="28" r="4" fill="#ffffff" />
                                        <rect x="85" y="55" width="20" height="20" rx="4" fill="#eff6ff" />
                                        <rect x="92" y="58" width="6" height="14" rx="2" fill="#2563eb" />
                                        <rect x="88" y="62" width="14" height="6" rx="2" fill="#2563eb" />
                                        <rect x="58" y="90" width="74" height="5" rx="2.5" fill="#93c5fd" />
                                        <rect x="58" y="104" width="74" height="5" rx="2.5" fill="#cbd5e1" />
                                        <rect x="58" y="118" width="74" height="5" rx="2.5" fill="#cbd5e1" />
                                        <rect x="58" y="132" width="50" height="5" rx="2.5" fill="#cbd5e1" />
                                        <rect x="58" y="146" width="60" height="5" rx="2.5" fill="#cbd5e1" />
                                        <g transform="rotate(35 155 125)">
                                            <rect x="145" y="60" width="14" height="90" rx="7" fill="#2563eb" />
                                            <path d="M145 150 L152 166 L159 150 Z" fill="#1e293b" />
                                            <circle cx="152" cy="166" r="1.5" fill="#38bdf8" />
                                            <rect x="148" y="70" width="8" height="15" rx="2" fill="#60a5fa" />
                                            <rect x="143" y="66" width="3" height="30" rx="1.5" fill="#93c5fd" />
                                        </g>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        )}

                        {/* Futuristic Hospital Admin HUD Form */}
                        {showHospitalAdminForm && (
                            <HospitalAdminHUDForm
                                hospitalAdminForm={hospitalAdminForm}
                                setHospitalAdminForm={setHospitalAdminForm}
                                handleCreateHospitalAdmin={handleCreateHospitalAdmin}
                                creatingHospitalAdmin={creatingHospitalAdmin}
                                hospitals={hospitals}
                                onClose={() => setShowHospitalAdminForm(false)}
                            />
                        )}

                        {/* Hospital Add/Edit Form matching reference design */}
                        {showHospitalForm && (
                            <div ref={hospitalFormRef} className="cad-create-hospital-page">
                                <div className="cad-create-hospital-grid">
                                    {/* Left Main Form Card */}
                                    <div className="cad-ch-main-card">
                                        <div className="cad-ch-card-header">
                                            <div className="cad-ch-icon-box">
                                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
                                                    <path d="M9 10h6" />
                                                    <path d="M12 7v6" />
                                                    <path d="M9 18h6" />
                                                </svg>
                                            </div>
                                            <div className="cad-ch-title-col">
                                                <h2>{editHospital ? 'Edit Hospital' : 'Create New Hospital'}</h2>
                                                <p>{editHospital ? 'Update hospital details and configurations' : 'Add a new hospital to the system'}</p>
                                            </div>
                                            <button 
                                                type="button" 
                                                className="cad-ch-close-btn" 
                                                onClick={() => { setShowHospitalForm(false); setEditHospital(null); }}
                                                title="Cancel"
                                            >
                                                ✕
                                            </button>
                                        </div>

                                        <form onSubmit={handleSaveHospital} className="cad-ch-form">
                                            {/* Row 1: Hospital Name & Subdomain Prefix */}
                                            <div className="cad-ch-row-2col">
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">Hospital Name <span className="cad-ch-req">*</span></label>
                                                    <input
                                                        type="text"
                                                        className="cad-ch-input"
                                                        placeholder="e.g. City General Hospital"
                                                        value={hospitalForm.name}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, name: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">
                                                        Subdomain Prefix <span className="cad-ch-req">*</span>
                                                        <span className="cad-ch-info-icon" title="Unique subdomain for hospital login and portal access">ⓘ</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="cad-ch-input"
                                                        placeholder="e.g. citycare"
                                                        value={hospitalForm.slug}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                                        required
                                                    />
                                                </div>
                                            </div>



                                            {/* Row 3: City, State, Phone */}
                                            <div className="cad-ch-row-3col">
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">City <span className="cad-ch-req">*</span></label>
                                                    <input
                                                        type="text"
                                                        className="cad-ch-input"
                                                        placeholder="e.g. Mumbai"
                                                        value={hospitalForm.city}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, city: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">State <span className="cad-ch-req">*</span></label>
                                                    <input
                                                        type="text"
                                                        className="cad-ch-input"
                                                        placeholder="e.g. Maharashtra"
                                                        value={hospitalForm.state}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, state: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">Phone <span className="cad-ch-req">*</span></label>
                                                    <input
                                                        type="tel"
                                                        className="cad-ch-input"
                                                        placeholder="Hospital contact number"
                                                        maxLength={10}
                                                        value={hospitalForm.phone}
                                                        onChange={e => {
                                                            const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                            setHospitalForm({ ...hospitalForm, phone: cleanVal });
                                                        }}
                                                        required
                                                        pattern="\d{10}"
                                                        title="Phone number must be exactly 10 digits"
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 4: Email & Website */}
                                            <div className="cad-ch-row-2col">
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">Email <span className="cad-ch-req">*</span></label>
                                                    <input
                                                        type="email"
                                                        className="cad-ch-input"
                                                        placeholder="example@gmail.com"
                                                        value={hospitalForm.email}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, email: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">Website</label>
                                                    <input
                                                        type="text"
                                                        className="cad-ch-input"
                                                        placeholder="e.g. www.cityhospital.com"
                                                        value={hospitalForm.website}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, website: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 5: Address */}
                                            <div className="cad-ch-row-full">
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">Address <span className="cad-ch-req">*</span></label>
                                                    <input
                                                        type="text"
                                                        className="cad-ch-input"
                                                        placeholder="Enter complete address"
                                                        value={hospitalForm.address}
                                                        onChange={e => setHospitalForm({ ...hospitalForm, address: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                            </div>

                                            {/* Row 6: Departments Provided */}
                                            <div className="cad-ch-row-full">
                                                <div className="cad-ch-field-group">
                                                    <label className="cad-ch-label">Departments Provided (Linked to Question Library)</label>
                                                    <div className="cad-ch-dept-container" ref={deptDropdownRef}>
                                                        <div
                                                            className={`cad-ch-dept-trigger ${deptDropdownOpen ? 'open' : ''}`}
                                                            onClick={() => setDeptDropdownOpen(!deptDropdownOpen)}
                                                        >
                                                            <div className="cad-ch-dept-trigger-text">
                                                                {(hospitalForm.departments || []).length === 0 ? (
                                                                    <span>Select departments</span>
                                                                ) : (
                                                                    (hospitalForm.departments || []).map(dept => (
                                                                        <span key={dept} className="cad-ch-dept-tag">
                                                                            {dept}
                                                                            <span
                                                                                className="cad-ch-dept-tag-remove"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setHospitalForm({
                                                                                        ...hospitalForm,
                                                                                        departments: (hospitalForm.departments || []).filter(d => d !== dept)
                                                                                    });
                                                                                }}
                                                                            >
                                                                                ×
                                                                            </span>
                                                                        </span>
                                                                    ))
                                                                )}
                                                            </div>
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: deptDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                                                                <polyline points="6 9 12 15 18 9" />
                                                            </svg>
                                                        </div>

                                                        {deptDropdownOpen && (
                                                            <div className="cad-ch-dept-dropdown-panel">
                                                                {availableDepartments.length === 0 ? (
                                                                    <div style={{ padding: '8px', color: '#94a3b8', fontSize: '0.84rem' }}>
                                                                        No departments found in Question Library.
                                                                    </div>
                                                                ) : (
                                                                    availableDepartments.map(dept => {
                                                                        const isSelected = (hospitalForm.departments || []).includes(dept);
                                                                        return (
                                                                            <div
                                                                                key={dept}
                                                                                className={`cad-ch-dept-option ${isSelected ? 'selected' : ''}`}
                                                                                onClick={() => {
                                                                                    if (isSelected) {
                                                                                        setHospitalForm({
                                                                                            ...hospitalForm,
                                                                                            departments: hospitalForm.departments.filter(d => d !== dept)
                                                                                        });
                                                                                    } else {
                                                                                        setHospitalForm({
                                                                                            ...hospitalForm,
                                                                                            departments: [...(hospitalForm.departments || []), dept]
                                                                                        });
                                                                                    }
                                                                                }}
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={isSelected}
                                                                                    readOnly
                                                                                    style={{ accentColor: '#059669', cursor: 'pointer' }}
                                                                                />
                                                                                <span>{dept}</span>
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* White-Label & Branding Settings */}
                                            <div style={{ marginTop: '24px', padding: '20px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>White-Label & Branding Settings</h3>
                                                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0 0' }}>Configure custom domains, themes, and logos for this hospital.</p>
                                                    </div>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={hospitalForm.whiteLabelEnabled} 
                                                            onChange={e => setHospitalForm({ ...hospitalForm, whiteLabelEnabled: e.target.checked })}
                                                            style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer' }}
                                                        />
                                                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>Enable White-Label</span>
                                                    </label>
                                                </div>

                                                {hospitalForm.whiteLabelEnabled && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                                                        <div className="cad-ch-row-2col">
                                                            <div className="cad-ch-field-group">
                                                                <label className="cad-ch-label">Custom Domain <span className="cad-ch-info-icon" title="e.g. portal.cityhospital.com">ⓘ</span></label>
                                                                <input
                                                                    type="text"
                                                                    className="cad-ch-input"
                                                                    placeholder="portal.cityhospital.com"
                                                                    value={hospitalForm.customDomain || ''}
                                                                    onChange={e => setHospitalForm({ ...hospitalForm, customDomain: e.target.value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') })}
                                                                />
                                                            </div>
                                                            <div className="cad-ch-field-group">
                                                                <label className="cad-ch-label">App Name</label>
                                                                <input
                                                                    type="text"
                                                                    className="cad-ch-input"
                                                                    placeholder="e.g. City Care"
                                                                    value={hospitalForm.brandingSchema?.appName || ''}
                                                                    onChange={e => setHospitalForm({ ...hospitalForm, brandingSchema: { ...hospitalForm.brandingSchema, appName: e.target.value } })}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="cad-ch-row-full">
                                                            <div className="cad-ch-field-group">
                                                                <label className="cad-ch-label">Logo URL</label>
                                                                <input
                                                                    type="text"
                                                                    className="cad-ch-input"
                                                                    placeholder="https://example.com/logo.png"
                                                                    value={hospitalForm.brandingSchema?.logoUrl || ''}
                                                                    onChange={e => setHospitalForm({ ...hospitalForm, brandingSchema: { ...hospitalForm.brandingSchema, logoUrl: e.target.value } })}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="cad-ch-row-3col">
                                                            <div className="cad-ch-field-group">
                                                                <label className="cad-ch-label">Primary Color</label>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    <input
                                                                        type="color"
                                                                        value={hospitalForm.brandingSchema?.themeColors?.primary || '#14b8a6'}
                                                                        onChange={e => setHospitalForm({ ...hospitalForm, brandingSchema: { ...hospitalForm.brandingSchema, themeColors: { ...hospitalForm.brandingSchema?.themeColors, primary: e.target.value } } })}
                                                                        style={{ height: '42px', width: '42px', padding: '0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                                    />
                                                                    <input type="text" className="cad-ch-input" style={{ flex: 1 }} value={hospitalForm.brandingSchema?.themeColors?.primary || '#14b8a6'} readOnly />
                                                                </div>
                                                            </div>
                                                            <div className="cad-ch-field-group">
                                                                <label className="cad-ch-label">Secondary Color</label>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    <input
                                                                        type="color"
                                                                        value={hospitalForm.brandingSchema?.themeColors?.secondary || '#0a2647'}
                                                                        onChange={e => setHospitalForm({ ...hospitalForm, brandingSchema: { ...hospitalForm.brandingSchema, themeColors: { ...hospitalForm.brandingSchema?.themeColors, secondary: e.target.value } } })}
                                                                        style={{ height: '42px', width: '42px', padding: '0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                                    />
                                                                    <input type="text" className="cad-ch-input" style={{ flex: 1 }} value={hospitalForm.brandingSchema?.themeColors?.secondary || '#0a2647'} readOnly />
                                                                </div>
                                                            </div>
                                                            <div className="cad-ch-field-group">
                                                                <label className="cad-ch-label">Background Color</label>
                                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                                    <input
                                                                        type="color"
                                                                        value={hospitalForm.brandingSchema?.themeColors?.background || '#ffffff'}
                                                                        onChange={e => setHospitalForm({ ...hospitalForm, brandingSchema: { ...hospitalForm.brandingSchema, themeColors: { ...hospitalForm.brandingSchema?.themeColors, background: e.target.value } } })}
                                                                        style={{ height: '42px', width: '42px', padding: '0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                                    />
                                                                    <input type="text" className="cad-ch-input" style={{ flex: 1 }} value={hospitalForm.brandingSchema?.themeColors?.background || '#ffffff'} readOnly />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Submit Button */}
                                            <button type="submit" disabled={savingHospital} className="cad-ch-submit-btn">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
                                                    <path d="M9 10h6" />
                                                    <path d="M12 7v6" />
                                                </svg>
                                                {savingHospital ? 'Saving...' : editHospital ? 'Update Hospital' : 'Create Hospital'}
                                            </button>
                                        </form>
                                    </div>

                                    {/* Right Companion Illustration Card */}
                                    <div className="cad-ch-side-card">
                                        <div className="cad-ch-side-illustration-wrap">
                                            <svg width="240" height="185" viewBox="0 0 260 210" fill="none" className="cad-ch-illustration-svg">
                                                {/* Lawn Ground */}
                                                <ellipse cx="130" cy="180" rx="105" ry="20" fill="#dcfce7" />
                                                <ellipse cx="130" cy="175" rx="85" ry="14" fill="#bbf7d0" fillOpacity="0.7" />
                                                
                                                {/* Left Tree */}
                                                <rect x="36" y="145" width="6" height="20" rx="2" fill="#15803d" />
                                                <circle cx="39" cy="135" r="14" fill="#22c55e" />
                                                <circle cx="33" cy="140" r="10" fill="#16a34a" />
                                                <circle cx="45" cy="138" r="10" fill="#4ade80" />

                                                {/* Right Tree */}
                                                <rect x="218" y="145" width="6" height="20" rx="2" fill="#15803d" />
                                                <circle cx="221" cy="135" r="14" fill="#22c55e" />
                                                <circle cx="215" cy="140" r="10" fill="#16a34a" />
                                                <circle cx="227" cy="138" r="10" fill="#4ade80" />

                                                {/* Shrubs */}
                                                <circle cx="62" cy="165" r="9" fill="#16a34a" />
                                                <circle cx="68" cy="163" r="7" fill="#22c55e" />
                                                <circle cx="198" cy="165" r="9" fill="#16a34a" />
                                                <circle cx="192" cy="163" r="7" fill="#22c55e" />

                                                {/* Left Building Wing */}
                                                <path d="M52 85 H80 V175 H52 V85 Z" fill="#f0fdf4" stroke="#86efac" strokeWidth="2" />
                                                {/* Right Building Wing */}
                                                <path d="M180 85 H208 V175 H180 V85 Z" fill="#f0fdf4" stroke="#86efac" strokeWidth="2" />

                                                {/* Left Wing Windows */}
                                                <rect x="58" y="98" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="68" y="98" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="58" y="118" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="68" y="118" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="58" y="138" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="68" y="138" width="8" height="12" rx="2" fill="#bbf7d0" />

                                                {/* Right Wing Windows */}
                                                <rect x="186" y="98" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="196" y="98" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="186" y="118" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="196" y="118" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="186" y="138" width="8" height="12" rx="2" fill="#bbf7d0" />
                                                <rect x="196" y="138" width="8" height="12" rx="2" fill="#bbf7d0" />

                                                {/* Main Center Tower */}
                                                <rect x="80" y="45" width="100" height="130" rx="12" fill="#ffffff" stroke="#86efac" strokeWidth="2.5" />

                                                {/* Center Roof Banner */}
                                                <rect x="75" y="40" width="110" height="10" rx="5" fill="#10b981" />
                                                
                                                {/* Roof Cross Sign Box */}
                                                <rect x="112" y="18" width="36" height="26" rx="6" fill="#ecfdf5" stroke="#10b981" strokeWidth="2" />
                                                <rect x="126" y="24" width="8" height="14" rx="2" fill="#059669" />
                                                <rect x="123" y="27" width="14" height="8" rx="2" fill="#059669" />

                                                {/* Floating badge */}
                                                <circle cx="130" cy="10" r="5" fill="#34d399" />
                                                <circle cx="130" cy="10" r="3" fill="#ffffff" />

                                                {/* Center Windows Grid */}
                                                <rect x="94" y="62" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="114" y="62" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="134" y="62" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="154" y="62" width="12" height="14" rx="2" fill="#bbf7d0" />

                                                <rect x="94" y="86" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="114" y="86" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="134" y="86" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="154" y="86" width="12" height="14" rx="2" fill="#bbf7d0" />

                                                <rect x="94" y="110" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="114" y="110" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="134" y="110" width="12" height="14" rx="2" fill="#bbf7d0" />
                                                <rect x="154" y="110" width="12" height="14" rx="2" fill="#bbf7d0" />

                                                {/* Center Entrance Door */}
                                                <rect x="112" y="140" width="36" height="35" rx="4" fill="#047857" />
                                                <rect x="110" y="137" width="40" height="6" rx="3" fill="#10b981" />
                                                <rect x="116" y="146" width="12" height="29" rx="2" fill="#ecfdf5" />
                                                <rect x="132" y="146" width="12" height="29" rx="2" fill="#ecfdf5" />
                                            </svg>
                                        </div>

                                        <h3 className="cad-ch-side-heading">You're almost there!</h3>
                                        <p className="cad-ch-side-subtitle">Fill in the details to add a new hospital to the system.</p>

                                        <div className="cad-ch-checklist">
                                            <div className="cad-ch-check-item">
                                                <span className="cad-ch-check-circle">✓</span>
                                                <span>Subdomain will be used for login and portal access.</span>
                                            </div>
                                            <div className="cad-ch-check-item">
                                                <span className="cad-ch-check-circle">✓</span>
                                                <span>Custom domain is optional.</span>
                                            </div>
                                            <div className="cad-ch-check-item">
                                                <span className="cad-ch-check-circle">✓</span>
                                                <span>You can manage departments after creation.</span>
                                            </div>
                                        </div>

                                        <div className="cad-ch-dots-bg">
                                                    <svg width="220" height="40" viewBox="0 0 220 40" fill="none">
                                                {[0, 1, 2, 3].map(row => (
                                                    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(col => (
                                                        <circle key={`${row}-${col}`} cx={10 + col * 14} cy={6 + row * 10} r="1.5" fill="#86efac" fillOpacity="0.45" />
                                                    ))
                                                ))}
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Hospital Cards Grid or Empty State - Hidden when form is open */}
                        {!showHospitalForm && !showHospitalAdminForm && !editHospital && (
                            loadingHospitals ? (
                                <div className="loading-message">⏳ Loading hospitals...</div>
                            ) : (() => {
                                const filteredHospitals = hospitals.filter(h => 
                                    activeTab === 'multi-speciality' 
                                        ? h.subscriptionPlan === 'multi_speciality_starter' 
                                        : activeTab === 'clinic-basic'
                                            ? h.subscriptionPlan === 'clinic_basic'
                                            : (h.subscriptionPlan !== 'multi_speciality_starter' && h.subscriptionPlan !== 'clinic_basic')
                                ).sort((a, b) => b._id.localeCompare(a._id));
                                
                                if (filteredHospitals.length === 0) {
                                    return (
                                        <div className="cad-empty-banner">
                                            <span className="cad-empty-icon">📄</span>
                                            <span>No hospitals found for this plan. Add your first hospital above.</span>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="cad-hospitals-grid">
                                        {filteredHospitals.map(h => (
                                            <div key={h._id} className="cad-hospital-card" onClick={() => openHospitalDetail(h)}>
                                                <div className="cad-hospital-card-header">
                                                    <div className="cad-hospital-logo-box">
                                                        {h.branding?.logoUrl ? (
                                                            <img src={h.branding.logoUrl} alt={h.name} />
                                                        ) : (
                                                            <span style={{ fontSize: '24px' }}>🏥</span>
                                                        )}
                                                    </div>
                                                    <div className="cad-hospital-info">
                                                        <h3 className="cad-hospital-name">
                                                            {h.branding?.appName || h.name}
                                                        </h3>
                                                        {h.branding?.tagline && (
                                                            <p className="cad-hospital-tagline">{h.branding.tagline}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="cad-hospital-meta-list">
                                                    {h.city && <span>📍 {h.city}{h.state ? `, ${h.state}` : ''}</span>}
                                                    {h.phone && <span>📞 {h.phone}</span>}
                                                    {h.email && <span>✉️ {h.email}</span>}

                                                    <div className="cad-domain-badge-wrap" onClick={e => e.stopPropagation()}>
                                                        {h.slug && (
                                                            <a href={`${window.location.protocol}//${h.slug}.${getBaseHost()}`} target="_blank" rel="noreferrer" className="cad-domain-badge">
                                                                🌐 {h.slug}.{getBaseHost()}
                                                            </a>
                                                        )}
                                                        {h.customDomain && (
                                                            <a href={`http://${h.customDomain}`} target="_blank" rel="noreferrer" className="cad-domain-badge">
                                                                🌐 {h.customDomain}
                                                            </a>
                                                        )}
                                                        <WhiteLabelBuilder hospital={h} />
                                                    </div>
                                                </div>

                                                <div className="cad-hospital-card-footer">
                                                    <div className="cad-hospital-click-hint">📊 Click to view full analytics →</div>
                                                    <div className="cad-hospital-btn-group" onClick={e => e.stopPropagation()}>
                                                        <button className="cad-btn-sm-branding" onClick={() => setBrandingHospital(h)}>🎨 Branding</button>
                                                        <button className="cad-btn-sm-edit" onClick={() => openEditHospital(h)}>Edit</button>
                                                        <button className="cad-btn-sm-delete" onClick={() => setDeleteHospitalConfirm(h._id)}>Delete</button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()
                        )}
                    </div>
                )}


                {/* ========== CLINICS TAB (Starter) ========== */}
                {activeTab === 'simple-clinics' && !selectedClinic && (
                    <div key={activeTab} className="cad-featured-plan-section cad-tab-content-anim">
                        <div className="cad-plan-header-row">
                            <div className="cad-plan-title-col">
                                <div className="cad-plan-badge-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="cad-plan-section-title">Starter Plan</h2>
                                    <p className="cad-plan-section-sub">Small clinics managed by 1 doctor. All features included.</p>
                                </div>
                            </div>
                            <div className="cad-plan-actions-row">
                                <button className="cad-btn-primary"
                                    onClick={() => { setShowClinicForm(!showClinicForm); setEditClinic(null); setClinicForm({ name: '', slug: '', address: '', city: '', state: '', phone: '', email: '', website: '', defaultFee: 0 }); }}>
                                    {showClinicForm ? 'Cancel' : '+ Add Starter Clinic'}
                                </button>
                            </div>
                        </div>

                        {/* Two Information Cards - Hidden when clinic form is open */}
                        {!showClinicForm && !editClinic && (
                        <div className="cad-plan-cards-grid">
                            <div className="cad-plan-info-card">
                                <div className="cad-info-card-header">
                                    <h3 className="cad-info-plan-name">Starter Plan</h3>
                                    <span className="cad-info-plan-price">₹6,000 / Year</span>
                                </div>
                                <h4 className="cad-info-provision-heading">Operational Provision</h4>
                                <div className="cad-info-features-grid">
                                    <div className="cad-feature-item"><span className="cad-check-blue">✓</span> 1 Doctor Account</div>
                                    <div className="cad-feature-item"><span className="cad-check-blue">✓</span> 1 Receptionist Account</div>
                                    <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Unlimited Patients</div>
                                    <div className="cad-feature-item"><span className="cad-check-blue">✓</span> All Facilities Included</div>
                                    <div className="cad-feature-item"><span className="cad-check-blue">✓</span> Dedicated Support</div>
                                </div>
                                <div className="cad-shield-watermark">
                                    <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#dbeafe" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                        <path d="m9 12 2 2 4-4" stroke="#93c5fd" strokeWidth="2"/>
                                    </svg>
                                </div>
                            </div>
                            <div className="cad-addon-card">
                                <div className="cad-addon-content-col">
                                    <div className="cad-addon-tag">
                                        <span className="cad-addon-sparkle">✨</span>
                                        <span className="cad-addon-tag-text">DIGITAL PRESENCE ADD-ON (₹5,000 EXTRA)</span>
                                    </div>
                                    <div className="cad-addon-checklist">
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> 5-Page Custom Website</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> 100% Responsive & Modern UI/UX</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> Free Hosting (1 Year)</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> .in Domain (1 Year)</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> WhatsApp Integration</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> On-Page SEO</div>
                                        <div className="cad-addon-item"><span className="cad-check-blue">✓</span> Lead Gen (Forms, Click-to-call)</div>
                                    </div>
                                </div>
                                <div className="cad-addon-graphic-col">
                                    <svg width="170" height="190" viewBox="0 0 200 220" fill="none" className="cad-clipboard-illustration">
                                        <ellipse cx="100" cy="195" rx="80" ry="18" fill="#e0f0fe" />
                                        <ellipse cx="100" cy="190" rx="65" ry="12" fill="#bfdbfe" fillOpacity="0.7" />
                                        <rect x="40" y="30" width="110" height="150" rx="14" fill="#ffffff" stroke="#93c5fd" strokeWidth="2.5" />
                                        <rect x="68" y="20" width="54" height="20" rx="6" fill="#60a5fa" />
                                        <circle cx="95" cy="28" r="4" fill="#ffffff" />
                                        <rect x="85" y="55" width="20" height="20" rx="4" fill="#eff6ff" />
                                        <rect x="92" y="58" width="6" height="14" rx="2" fill="#2563eb" />
                                        <rect x="88" y="62" width="14" height="6" rx="2" fill="#2563eb" />
                                        <rect x="58" y="90" width="74" height="5" rx="2.5" fill="#93c5fd" />
                                        <rect x="58" y="104" width="74" height="5" rx="2.5" fill="#cbd5e1" />
                                        <rect x="58" y="118" width="74" height="5" rx="2.5" fill="#cbd5e1" />
                                        <rect x="58" y="132" width="50" height="5" rx="2.5" fill="#cbd5e1" />
                                        <rect x="58" y="146" width="60" height="5" rx="2.5" fill="#cbd5e1" />
                                        <g transform="rotate(35 155 125)">
                                            <rect x="145" y="60" width="14" height="90" rx="7" fill="#2563eb" />
                                            <path d="M145 150 L152 166 L159 150 Z" fill="#1e293b" />
                                            <circle cx="152" cy="166" r="1.5" fill="#38bdf8" />
                                            <rect x="148" y="70" width="8" height="15" rx="2" fill="#60a5fa" />
                                            <rect x="143" y="66" width="3" height="30" rx="1.5" fill="#93c5fd" />
                                        </g>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        )}

                            {/* Add / Edit Clinic Form */}
                            {showClinicForm && (
                                <div className="cad-form-box">
                                    <h3>{editClinic ? '✏️ Edit Clinic' : '🏪 Add Starter Clinic'}</h3>
                                    <form onSubmit={handleSaveClinic} className="user-form">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Clinic Name *</label>
                                                <input type="text" className="staff-input w-full" placeholder="e.g. Sharma Family Clinic" value={clinicForm.name}
                                                    onChange={e => setClinicForm({ ...clinicForm, name: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Subdomain / Slug *</label>
                                                <input type="text" className="staff-input w-full" placeholder="e.g. sharma-clinic" value={clinicForm.slug}
                                                    onChange={e => setClinicForm({ ...clinicForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                                                <small style={{ color: '#888' }}>Leave blank to auto-generate from name</small>
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Address</label>
                                                <input type="text" className="staff-input w-full" placeholder="Street address" value={clinicForm.address}
                                                    onChange={e => setClinicForm({ ...clinicForm, address: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">City</label>
                                                <input type="text" className="staff-input w-full" placeholder="e.g. Delhi" value={clinicForm.city}
                                                    onChange={e => setClinicForm({ ...clinicForm, city: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">State</label>
                                                <input type="text" className="staff-input w-full" placeholder="e.g. Delhi" value={clinicForm.state}
                                                    onChange={e => setClinicForm({ ...clinicForm, state: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Phone *</label>
                                                <input type="tel" className="staff-input" placeholder="Clinic contact number" maxLength={10} value={clinicForm.phone}
                                                    onChange={e => {
                                                        const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                        setClinicForm({ ...clinicForm, phone: cleanVal });
                                                    }} required pattern="\d{10}" title="Phone number must be exactly 10 digits" />
                                            </div>
                                        </div>
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label className="staff-label">Email *</label>
                                                <input type="email" className="staff-input" placeholder="clinic@email.com" value={clinicForm.email}
                                                    onChange={e => setClinicForm({ ...clinicForm, email: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label className="staff-label">Consultation Fee (₹)</label>
                                                <input type="number" className="staff-input" placeholder="300" value={clinicForm.defaultFee}
                                                    onChange={e => setClinicForm({ ...clinicForm, defaultFee: Number(e.target.value) })} />
                                            </div>
                                        </div>
                                        <button type="submit" disabled={savingClinic} className="cad-btn-primary" style={{ width: '100%' }}>
                                            {savingClinic ? 'Saving...' : editClinic ? '✅ Update Clinic' : '✅ Create Clinic'}
                                        </button>
                                    </form>
                                </div>
                            )}

                            {/* Clinics List - Hidden when clinic form is open */}
                            {!showClinicForm && !editClinic && (
                                loadingClinics ? (
                                    <div className="loading-message">⏳ Loading clinics...</div>
                                ) : (() => {
                                    const filteredClinics = clinics.filter(clinic => 
                                        activeTab === 'clinic-basic' 
                                            ? clinic.subscriptionPlan === 'clinic_basic'
                                            : clinic.subscriptionPlan !== 'clinic_basic'
                                    ).sort((a, b) => b._id.localeCompare(a._id));

                                    if (filteredClinics.length === 0) {
                                        return (
                                            <div className="cad-empty-banner">
                                                <span className="cad-empty-icon">🏪</span>
                                                <span>No clinics found in this plan. Click <strong>+ Add Starter Clinic</strong> to get started.</span>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="cad-hospitals-grid">
                                            {filteredClinics.map(clinic => (
                                            <div key={clinic._id} className="cad-hospital-card" onClick={() => openClinicDetail(clinic)}>
                                                <div className="cad-hospital-card-header">
                                                    <div className="cad-hospital-logo-box">
                                                        <span style={{ fontSize: '22px' }}>🏪</span>
                                                    </div>
                                                    <div className="cad-hospital-info">
                                                        <h3 className="cad-hospital-name">{clinic.name}</h3>
                                                        <p className="cad-hospital-tagline">{clinic.city}{clinic.state ? `, ${clinic.state}` : ''}</p>
                                                    </div>
                                                </div>
                                                <div className="cad-hospital-meta-list">
                                                    {clinic.phone && <span>📞 {clinic.phone}</span>}
                                                    {clinic.email && <span>✉️ {clinic.email}</span>}
                                                    <div>💰 Consultation Fee: {formatCurrency(clinic.defaultFee)}</div>
                                                    {clinic.slug && (
                                                        <div className="cad-domain-badge-wrap" onClick={e => e.stopPropagation()}>
                                                            <a href={`${window.location.protocol}//${clinic.slug}.${getBaseHost()}`} target="_blank" rel="noopener noreferrer" className="cad-domain-badge">
                                                                🔗 {clinic.slug}.{getBaseHost()}
                                                            </a>
                                                        </div>
                                                    )}
                                                    {clinic.adminUserId && (
                                                        <span style={{ marginTop: '4px', color: '#16a34a', fontWeight: 600 }}>👤 Admin: {clinic.adminUserId.name}</span>
                                                    )}
                                                </div>
                                                <div className="cad-hospital-card-footer">
                                                    <div className="cad-hospital-click-hint">📊 Click to view full analytics →</div>
                                                    <div className="cad-hospital-btn-group" onClick={e => e.stopPropagation()}>
                                                        <button className="cad-btn-sm-edit"
                                                            onClick={() => { setEditClinic(clinic); setClinicForm({ name: clinic.name, slug: clinic.slug || '', address: clinic.address || '', city: clinic.city || '', state: clinic.state || '', phone: clinic.phone || '', email: clinic.email || '', website: clinic.website || '', defaultFee: clinic.defaultFee || 0 }); setShowClinicForm(true); }}>
                                                            ✏️ Edit
                                                        </button>
                                                        <button className="cad-btn-sm-delete"
                                                            onClick={() => setDeleteClinicConfirm(clinic._id)}>
                                                            🗑️ Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            ))}
                                        </div>
                                    );
                                })()
                            )}
                    </div>
                )}

                {/* ========== SIMPLE CLINIC DETAIL VIEW ========== */}
                {activeTab === 'simple-clinics' && selectedClinic && (
                    <div>
                        {/* Header */}
                        <div className="bg-white rounded-2xl p-5 md:p-6 shadow-sm mb-6">
                            {/* Top Row: Back Button */}
                            <div className="flex justify-between items-center mb-4">
                                <button onClick={closeClinicDetail} className="back-btn-light inline-flex items-center m-0">
                                    ← Back to All Clinics
                                </button>
                                <span className={`status-badge ${selectedClinic.isActive ? 'status-active' : 'status-inactive'}`} style={{
                                    padding: '6px 14px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', borderRadius: '20px',
                                    border: selectedClinic.isActive ? '1px solid #15803d' : '1px solid #b91c1c',
                                    background: selectedClinic.isActive ? '#dcfce7' : '#fee2e2',
                                    color: selectedClinic.isActive ? '#15803d' : '#b91c1c', display: 'inline-flex', alignItems: 'center', height: 'fit-content'
                                }}>
                                    {selectedClinic.isActive ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                            </div>

                            {/* Bottom Row */}
                            <div className="flex flex-col md:flex-row flex-wrap md:justify-between items-start md:items-center gap-4 w-full">
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'nowrap' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid #cbd5e1', flexShrink: 0 }}>🏪</div>
                                    <div style={{ minWidth: 0 }}>
                                        <h1 style={{ fontSize: 'clamp(1.2rem, 4.5vw, 1.6rem)', fontWeight: 850, color: '#1e293b', margin: 0, lineHeight: '1.2', wordBreak: 'break-word' }}>
                                            {selectedClinic.name}
                                        </h1>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#64748b', fontSize: 'clamp(0.8rem, 3vw, 0.92rem)', marginTop: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                {selectedClinic.city && <span>📍 {selectedClinic.city}{selectedClinic.state ? `, ${selectedClinic.state}` : ''}</span>}
                                                {selectedClinic.phone && <span>📞 {selectedClinic.phone}</span>}
                                            </div>
                                            {selectedClinic.slug && <div><a href={`${window.location.protocol}//${selectedClinic.slug}.${getBaseHost()}`} target="_blank" rel="noopener noreferrer" style={{ color: '#14b8a6', textDecoration: 'none', fontFamily: 'monospace' }}>🔗 {selectedClinic.slug}.{getBaseHost()}</a></div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

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
                                        <div key={i} className="admin-card w-full max-w-full min-w-0" style={{ background: kpi.bg, border: `1px solid ${kpi.color}22`, textAlign: 'center', padding: '18px' }}>
                                            <div style={{ fontSize: '28px', marginBottom: '6px' }}>{kpi.icon}</div>
                                            <div style={{ fontSize: '22px', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{kpi.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Clinic Admin Section */}
                                <div className="admin-card w-full max-w-full min-w-0" style={{ marginBottom: '20px', border: '2px solid #e0e7ff' }}>
                                    <div className="flex flex-col md:flex-row flex-wrap md:justify-between items-start md:items-center gap-4 w-full" style={{ marginBottom: '16px' }}>
                                        <div>
                                            <h3 className="break-words whitespace-normal max-w-full" style={{ margin: 0 }}>👤 Clinic Admin Account</h3>
                                            <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>
                                                The admin has full access to this clinic. Login at <strong>/login</strong>
                                            </p>
                                        </div>
                                        {(() => {
                                            const isStarter = clinicStats.clinic?.subscriptionPlan === 'starter' || clinicStats.clinic?.clinicPlan === 'starter' || activeTab === 'simple-clinics';
                                            const hasAdmin = !!clinicStats.clinic?.adminUserId;
                                            const disableAdminBtn = isStarter && hasAdmin && !showClinicManagerForm;
                                            
                                            return (
                                                <button 
                                                    className={showClinicManagerForm ? 'btn-cancel' : 'btn-save'} 
                                                    style={{ 
                                                        fontSize: '13px', 
                                                        padding: '8px 16px',
                                                        opacity: disableAdminBtn ? 0.5 : 1,
                                                        cursor: disableAdminBtn ? 'not-allowed' : 'pointer'
                                                    }}
                                                    onClick={disableAdminBtn ? undefined : () => { setShowClinicManagerForm(!showClinicManagerForm); setShowClinicStaffForm(false); setClinicManagerForm({ name: '', email: '', password: '', phone: '' }); }}
                                                    title={disableAdminBtn ? "Starter Plan allows only 1 Hospital Admin." : ""}
                                                >
                                                    {showClinicManagerForm ? 'Cancel' : hasAdmin ? '🔄 Add Another Admin' : '+ Add Clinic Admin'}
                                                </button>
                                            );
                                        })()}
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
                                            <form onSubmit={handleCreateClinicManager} className="user-form">
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Full Name *</label>
                                                        <input type="text" className="staff-input w-full" placeholder="e.g. Dr. Ramesh Sharma" value={clinicManagerForm.name}
                                                            onChange={e => setClinicManagerForm({ ...clinicManagerForm, name: e.target.value })} required minLength={2} />
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
                                                        <input type="text" className="staff-input w-full" placeholder="Set a temporary password" value={clinicManagerForm.password}
                                                            onChange={e => setClinicManagerForm({ ...clinicManagerForm, password: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Phone *</label>
                                                        <input type="tel" className="staff-input" placeholder="Phone number" maxLength={10} value={clinicManagerForm.phone}
                                                            onChange={e => {
                                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                                setClinicManagerForm({ ...clinicManagerForm, phone: cleanVal });
                                                            }} required pattern="\d{10}" title="Phone number must be exactly 10 digits" />
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Age *</label>
                                                        <input type="number" className="staff-input" placeholder="Age" value={clinicManagerForm.age} onChange={e => setClinicManagerForm({ ...clinicManagerForm, age: e.target.value })} required min="1" />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Aadhaar Number *</label>
                                                        <input type="text" className="staff-input w-full" placeholder="12-digit Aadhaar" value={clinicManagerForm.aadhaarNumber} onChange={e => {
                                                            const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 12);
                                                            setClinicManagerForm({ ...clinicManagerForm, aadhaarNumber: cleanVal });
                                                        }} required pattern="^\d{12}$" title="Aadhaar number must be exactly 12 digits" />
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
                                <div className="admin-card w-full max-w-full min-w-0" style={{ marginBottom: '20px' }}>
                                    <div className="flex flex-col md:flex-row flex-wrap md:justify-between items-start md:items-center gap-4 w-full" style={{ marginBottom: '16px' }}>
                                        <div>
                                            <h3 className="break-words whitespace-normal max-w-full" style={{ margin: 0 }}>👥 Additional Staff</h3>
                                            <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>
                                                Tier: {clinicStats.stats.staff?.filter(s => s.role?.toLowerCase() === 'doctor' || s.role?.toLowerCase() === 'clinic doctor').length || 0}/{clinicStats.clinic?.tier?.maxDoctors || 1} Doctors · {clinicStats.stats.staff?.filter(s => s.role?.toLowerCase() === 'hospitaladmin' || s.role?.toLowerCase() === 'clinic admin').length || 0}/1 Hospital Admin · All login at <strong>/login</strong>
                                            </p>
                                        </div>
                                        {(() => {
                                            const isStarter = clinicStats.clinic?.subscriptionPlan === 'starter' || clinicStats.clinic?.clinicPlan === 'starter' || activeTab === 'simple-clinics';
                                            const totalUsers = clinicStats.stats?.staff?.length || 0;
                                            const disableStaffBtn = isStarter && totalUsers >= 2 && !showClinicStaffForm;
                                            
                                            return (
                                                <button 
                                                    className="btn-edit" 
                                                    style={{ 
                                                        fontSize: '13px', 
                                                        padding: '8px 14px',
                                                        opacity: disableStaffBtn ? 0.5 : 1,
                                                        cursor: disableStaffBtn ? 'not-allowed' : 'pointer'
                                                    }}
                                                    onClick={disableStaffBtn ? undefined : () => { setShowClinicStaffForm(!showClinicStaffForm); setShowClinicManagerForm(false); }}
                                                    title={disableStaffBtn ? "Starter Plan user limit reached. Upgrade your plan to add more staff." : ""}
                                                >
                                                    {showClinicStaffForm ? 'Cancel' : '+ Add Staff'}
                                                </button>
                                            );
                                        })()}
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
                                                        <input type="text" className="staff-input w-full" placeholder="Staff name" value={clinicStaffForm.name}
                                                            onChange={e => setClinicStaffForm({ ...clinicStaffForm, name: e.target.value })} required minLength={2} />
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
                                                        <input type="text" className="staff-input w-full" placeholder="Temporary password" value={clinicStaffForm.password}
                                                            onChange={e => setClinicStaffForm({ ...clinicStaffForm, password: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Phone *</label>
                                                        <input type="tel" className="staff-input" placeholder="Phone number" maxLength={10} value={clinicStaffForm.phone}
                                                            onChange={e => {
                                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 10);
                                                                setClinicStaffForm({ ...clinicStaffForm, phone: cleanVal });
                                                            }} required pattern="\d{10}" title="Phone number must be exactly 10 digits" />
                                                    </div>
                                                </div>
                                                <div className="form-row">
                                                    <div className="form-group">
                                                        <label className="staff-label">Age *</label>
                                                        <input 
                                                            type="text" 
                                                            className="staff-input" 
                                                            placeholder="Age" 
                                                            value={clinicStaffForm.age || ''} 
                                                            onChange={e => {
                                                                const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 3);
                                                                setClinicStaffForm({ ...clinicStaffForm, age: cleanVal });
                                                            }} 
                                                            required 
                                                        />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="staff-label">Aadhaar Number *</label>
                                                        <input type="text" className="staff-input w-full" placeholder="12-digit Aadhaar" value={clinicStaffForm.aadhaarNumber} onChange={e => {
                                                            const cleanVal = e.target.value.replace(/\D/g, '').slice(0, 12);
                                                            setClinicStaffForm({ ...clinicStaffForm, aadhaarNumber: cleanVal });
                                                        }} required pattern="^\d{12}$" title="Aadhaar number must be exactly 12 digits" />
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="staff-label">Role *</label>
                                                    <select className="staff-input w-full" value={clinicStaffForm.staffRole}
                                                        onChange={e => setClinicStaffForm({ ...clinicStaffForm, staffRole: e.target.value })}>
                                                        <option value="doctor">🩺 Clinic Doctor</option>
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
                                        <div className="users-table w-full overflow-x-auto">
                                            <table className="w-full min-w-[600px] overflow-hidden">
                                                <thead>
                                                    <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Added</th><th></th></tr>
                                                </thead>
                                                <tbody>
                                                    {clinicStats.stats.staff.map(s => (
                                                        <tr key={s._id}>
                                                            <td style={{ fontWeight: 600 }}>
                                                                <div className="flex flex-row items-center gap-3">
                                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6366f1', fontSize: '13px', flexShrink: 0 }}>
                                                                        {s.name?.charAt(0)?.toUpperCase()}
                                                                    </div>
                                                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
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
                                    <div className="admin-card w-full max-w-full min-w-0">
                                        <h3>📅 Recent Appointments</h3>
                                        <div className="users-table w-full overflow-x-auto">
                                            <table className="w-full min-w-[600px] overflow-hidden">
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
                                <div className="admin-card w-full max-w-full min-w-0" style={{ marginTop: '20px', border: '2px solid #e0e7ff' }}>
                                    <h3 style={{ marginBottom: '4px' }}>💳 Billing &amp; Subscription</h3>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>
                                        Patient code: <strong style={{ color: '#6366f1' }}>{clinicStats.clinic?.clinicCode || '—'}</strong> · Rate per new patient this month
                                    </p>

                                    {/* Set rate form */}
                                    <form onSubmit={handleSaveRate} className="grid md:flex md:flex-wrap md:items-end gap-[10px]" style={{ gridTemplateColumns: '1fr auto', marginBottom: '20px', padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
                                        <div className="order-1 md:order-1">
                                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Rate per New Patient (₹)</label>
                                            <input type="number" min="0" className="w-full sm:w-[160px]" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                                                placeholder="e.g. 50" value={subscriptionRateForm.ratePerPatient}
                                                onChange={e => setSubscriptionRateForm(f => ({ ...f, ratePerPatient: e.target.value }))} />
                                        </div>
                                        <div className="order-3 md:order-2" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: '4px' }}>
                                            <input type="checkbox" id="billingEnabled" checked={subscriptionRateForm.billingEnabled}
                                                onChange={e => setSubscriptionRateForm(f => ({ ...f, billingEnabled: e.target.checked }))} />
                                            <label htmlFor="billingEnabled" style={{ fontSize: '13px', color: '#475569', cursor: 'pointer' }}>Enable billing</label>
                                        </div>
                                        <button type="submit" className="btn-save order-2 md:order-3" style={{ alignSelf: 'end', fontSize: '13px', padding: '8px 16px', height: '38px' }} disabled={savingRate}>
                                            {savingRate ? 'Saving...' : '💾 Save Rate'}
                                        </button>
                                    </form>

                                    {/* Subscription history table */}
                                    {clinicSubscriptions.length > 0 ? (
                                        <div className="users-table w-full overflow-x-auto">
                                            <table className="w-full min-w-[600px] overflow-hidden">
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
                                                                <span style={{
                                                                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                                                                    background: sub.status === 'paid' ? '#dcfce7' : sub.status === 'waived' ? '#f1f5f9' : '#fef3c7',
                                                                    color: sub.status === 'paid' ? '#16a34a' : sub.status === 'waived' ? '#64748b' : '#92400e'
                                                                }}>
                                                                    {sub.status.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                {sub.status !== 'paid' && (
                                                                    <button className="btn-save w-full md:w-auto" style={{ fontSize: '11px', padding: '4px 10px', marginRight: '4px' }}
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
                                <div className="admin-card w-full max-w-full min-w-0" style={{ marginTop: '20px', border: '2px solid #e0f2fe' }}>
                                    <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-[10px]" style={{ marginBottom: '6px' }}>
                                        <h3 className="break-words whitespace-normal max-w-full" style={{ margin: 0 }}>🎟️ Appointment System Mode</h3>
                                        <span style={{ fontSize: '0.75rem', background: selectedClinic.appointmentMode === 'token' ? '#fef3c7' : '#dbeafe', color: selectedClinic.appointmentMode === 'token' ? '#92400e' : '#1d4ed8', padding: '2px 10px', borderRadius: '20px', fontWeight: 700 }}>
                                            Current: {selectedClinic.appointmentMode === 'token' ? 'Token Queue' : 'Time Slots'}
                                        </span>
                                    </div>
                                    <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
                                        Choose how patients are managed in this clinic's reception queue.
                                    </p>
                                    <div className="flex md:grid md:grid-cols-2 gap-4 mb-4 overflow-x-auto pb-4 hide-scrollbars" style={{ scrollSnapType: 'x mandatory' }}>
                                        {/* Token Mode Card */}
                                        <label className="shrink-0 w-11/12 md:w-auto" style={{
                                            display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                            border: clinicApptMode === 'token' ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                                            background: clinicApptMode === 'token' ? '#fffbeb' : '#f8fafc',
                                            transition: 'all 0.15s', scrollSnapAlign: 'center'
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
                                        <label className="shrink-0 w-11/12 md:w-auto" style={{
                                            display: 'block', padding: '18px', borderRadius: '12px', cursor: 'pointer',
                                            border: clinicApptMode === 'slot' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                                            background: clinicApptMode === 'slot' ? '#eff6ff' : '#f8fafc',
                                            transition: 'all 0.15s', scrollSnapAlign: 'center'
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
                                <div className="admin-card w-full max-w-full min-w-0" style={{ marginTop: '20px' }}>
                                    <h3>🚀 Clinic Features</h3>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px' }}>Staff can access these modules after logging in at <strong>/login</strong></p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    <div key={activeTab} className="cad-tab-content-anim">
                        <div className="admin-card w-full max-w-full min-w-0">
                            <div className="flex flex-col md:flex-row flex-wrap md:justify-between items-start md:items-center gap-4 w-full" style={{ marginBottom: '20px' }}>
                                <div>
                                    <h2>💰 Revenue Plans</h2>
                                    <p style={{ color: '#888', fontSize: '13px', margin: '4px 0 0' }}>Assign a billing model to each hospital or clinic</p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3 w-full">
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
                                    <button className="btn-save w-full md:w-auto" style={{ marginTop: '12px' }} onClick={fetchRevenuePlans}>Load Plans</button>
                                </div>
                            ) : (
                                <div className="users-table w-full overflow-x-auto">
                                    <table className="w-full min-w-[600px] overflow-hidden">
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
                                            <button type="submit" className="btn-save w-full md:w-auto" disabled={savingPlan}>
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
                    <div key={activeTab} className="admin-card w-full max-w-full min-w-0 cad-tab-content-anim">
                        <h2>⚙️ System Configurations</h2>
                        <p style={{ color: '#888', fontSize: '14px', margin: '5px 0 20px' }}>
                            Manage global settings — roles, question libraries, lab tests, medicines, services, and test packages.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[
                                { icon: '🔑', label: 'Roles & Permissions', desc: 'Create and manage user roles', path: '/admin/roles', bg: '#eff6ff', color: '#3b82f6' },
                                { icon: '❓', label: 'Question Library', desc: 'Configure assessment forms', path: '/admin/question-library', bg: '#f5f3ff', color: '#8b5cf6' },
                                { icon: '🧪', label: 'Lab Tests', desc: 'Manage lab test catalog', path: '/admin/lab-tests', bg: '#fdf4ff', color: '#d946ef' },
                                { icon: '📦', label: 'Test Packages', desc: 'Bundle lab tests into packages', path: '/admin/test-packages', bg: '#f0fdf4', color: '#22c55e' },
                                { icon: '💊', label: 'Medicine Catalog', desc: 'Global medicine library', path: '/admin/medicines', bg: '#fff7ed', color: '#f97316' },
                                { icon: '🛠️', label: 'Services', desc: 'Hospital services & pricing', path: '/admin/services', bg: '#fefce8', color: '#eab308' },
                                { icon: '📝', label: 'Consent Management', desc: 'Manage consent templates', path: '/admin/consent', bg: '#fef2f2', color: '#ef4444' },
                                { icon: '🧪', label: 'Labs', desc: 'Manage lab departments', tab: 'labs', bg: '#f0f9ff', color: '#0ea5e9' },
                                { icon: '🏥', label: 'Pharmacy', desc: 'Manage pharmacy departments', tab: 'pharmacy', bg: '#fff1f2', color: '#f43f5e' },
                            ].map((item, i) => (
                                <div key={i} className="config-card" onClick={() => item.tab ? setActiveTab(item.tab) : navigate(item.path)} style={{ background: item.bg }}>
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

                {/* ========== LABS TAB ========== */}
                {activeTab === 'labs' && (
                    <div style={{ marginTop: '20px' }}>
                        <button className="btn-cancel" style={{ marginBottom: '20px' }} onClick={() => setActiveTab('configurations')}>← Back to Configurations</button>
                        <AdminLabs />
                    </div>
                )}

                {/* ========== PHARMACY TAB ========== */}
                {activeTab === 'pharmacy' && (
                    <div style={{ marginTop: '20px' }}>
                        <button className="btn-cancel" style={{ marginBottom: '20px' }} onClick={() => setActiveTab('configurations')}>← Back to Configurations</button>
                        <AdminPharmacy />
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
