import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    FiUsers, FiCalendar, FiCheckCircle, FiClock, FiSearch, 
    FiFilter, FiSliders, FiMoreHorizontal, FiPhoneCall, FiMail, 
    FiActivity, FiFileText, FiChevronDown, 
    FiX, FiUploadCloud, FiTrendingUp, FiUserCheck,
    FiCheck, FiArrowRight, FiUser, FiRotateCcw, FiRefreshCw
} from 'react-icons/fi';
import { FaUserMd } from 'react-icons/fa';
import { doctorAPI, reportAPI } from '../../utils/api';
import './Patient.css';

const Patient = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Core state
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Search, Tabs, Filter & Sort
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'today'
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('latest'); // 'latest' | 'oldest' | 'name-asc' | 'name-desc'
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Dropdowns & Popovers
    const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

    // Modals
    const [vitalsPatient, setVitalsPatient] = useState(null);
    const [uploadPatient, setUploadPatient] = useState(null);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [vitals, setVitals] = useState({
        weight: '', height: '', bmi: '', bloodPressure: '',
        pulse: '', temperature: '', spo2: '', respiratoryRate: '',
        chiefComplaint: '', notes: ''
    });

    const menuRef = useRef(null);

    // Backward compatibility: If accessed with ?tab=referrals or ?tab=surgery_plans, redirect to sidebar routes
    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const tab = searchParams.get('tab');
        if (tab === 'referrals') {
            navigate('/doctor/surgery-referrals', { replace: true });
        } else if (tab === 'surgery_plans') {
            navigate('/doctor/surgery-plans', { replace: true });
        }
    }, [location.search, navigate]);

    // Fetch initial appointments
    useEffect(() => {
        fetchAllAppointments();
    }, []);

    // Click outside handler for 3-dots menus (modal uses its own backdrop + stopPropagation)
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close filter modal on Escape key press
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setFilterPopoverOpen(false);
            }
        };
        if (filterPopoverOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [filterPopoverOpen]);

    const fetchAllAppointments = async () => {
        setLoading(true);
        setError(null);
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const role = (user.role || '').toLowerCase();
            const permissions = user.permissions || [];
            
            const staffRoles = ['nurse', 'admin', 'superadmin', 'hospitaladmin', 'reception', 'receptionist'];
            const isAdminOrStaff = staffRoles.some(r => role.includes(r));
            const isDoctor = role.includes('doctor');
            const isClinicDoctor = isDoctor && user.clinicType === 'clinic';
            
            const hasViewAllAccess = isClinicDoctor || (!isDoctor && (isAdminOrStaff || permissions.includes('patient_view') || permissions.includes('appointment_view_all')));

            const res = hasViewAllAccess
                ? await doctorAPI.getAllAppointments()
                : await doctorAPI.getAppointments();

            if (res.success && Array.isArray(res.appointments)) {
                setAppointments(res.appointments);
            } else {
                setAppointments([]);
            }
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Unable to load appointments. Please check network connection or try again.');
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleManualRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await fetchAllAppointments();
            toast.success('Patient queue refreshed');
        } catch (err) {
            toast.error('Failed to refresh queue');
        } finally {
            setTimeout(() => setRefreshing(false), 500);
        }
    };

    // Navigation to Patient Profile
    const handleViewProfile = (apt) => {
        if (!apt) return;
        const targetId = (typeof apt.userId === 'object' ? apt.userId?._id || apt.userId?.patientId || apt.userId?.mrn : apt.userId)
            || (typeof apt.clinicPatientId === 'object' ? apt.clinicPatientId?._id || apt.clinicPatientId?.patientUid : apt.clinicPatientId)
            || apt.patientId 
            || apt._id;

        if (!targetId) {
            toast.error('Patient record identifier not found');
            return;
        }

        const dept = apt.department || apt.serviceName || apt.specialization || 'Unassigned';
        navigate(`/patient/${targetId}/department/${encodeURIComponent(dept)}`);
    };

    // Calculate BMI when weight/height change
    useEffect(() => {
        const w = parseFloat(vitals.weight);
        const h = parseFloat(vitals.height) / 100; // cm to m
        if (w > 0 && h > 0) {
            setVitals(v => ({ ...v, bmi: (w / (h * h)).toFixed(1) }));
        }
    }, [vitals.weight, vitals.height]);

    const handleUploadReport = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadPatient) return;
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('reportFile', uploadFile);
            formData.append('appointmentId', uploadPatient._id);
            
            const res = await reportAPI.uploadReport(formData);
            if (res.success && res.report) {
                const uploadedFile = res.report;
                const patientId = uploadPatient.userId?._id || uploadPatient.clinicPatientId?.patientUid || uploadPatient.clinicPatientId?._id || uploadPatient.patientId;
                
                const isClinic = !!uploadPatient.clinicPatientId;
                const existingReports = isClinic 
                    ? (uploadPatient.clinicPatientId?.reports || []).map(r => ({
                        fileName: r.name,
                        url: (r.filename || '').startsWith('http://') || (r.filename || '').startsWith('https://')
                            ? r.filename
                            : `${import.meta.env.VITE_API_URL || 'https://hms-n6nk.onrender.com'}/api/patients/reports/${encodeURIComponent(r.filename)}`,
                        date: r.uploadedAt
                      }))
                    : (uploadPatient.userId?.fertilityProfile?.previousReports || []);
                
                const newReport = {
                    fileName: uploadFile.name,
                    url: uploadedFile.url,
                    date: new Date().toISOString()
                };

                if (patientId) {
                    await doctorAPI.updatePatientProfile(patientId, {
                        previousReports: [...existingReports, newReport]
                    });
                }

                toast.success("Report uploaded successfully!");
                setUploadPatient(null);
                setUploadFile(null);
                fetchAllAppointments();
            } else {
                toast.success("Report saved to patient file!");
                setUploadPatient(null);
                setUploadFile(null);
            }
        } catch (err) {
            console.error(err);
            toast.error("Error uploading report: " + (err.message || ''));
        } finally {
            setUploading(false);
        }
    };

    const handleSaveVitals = async () => {
        if (!vitalsPatient) return;
        setSaving(true);
        try {
            const patientId = vitalsPatient.clinicPatientId?._id || vitalsPatient.clinicPatientId || vitalsPatient.userId?._id || vitalsPatient.userId;
            const profileData = {
                vitals: {
                    weight: vitals.weight,
                    height: vitals.height,
                    bmi: vitals.bmi,
                    bloodPressure: vitals.bloodPressure,
                    pulse: vitals.pulse,
                    temperature: vitals.temperature,
                    spo2: vitals.spo2,
                    respiratoryRate: vitals.respiratoryRate,
                    lastRecorded: new Date().toISOString()
                }
            };
            if (patientId) {
                await doctorAPI.updatePatientProfile(patientId, profileData);
            }

            if (vitals.chiefComplaint || vitals.notes) {
                try {
                    await doctorAPI.updateSession(vitalsPatient._id, {
                        notes: `Chief Complaint: ${vitals.chiefComplaint}\nNurse Notes: ${vitals.notes}`
                    });
                } catch (e) {}
            }

            toast.success('Vitals saved successfully!');
            setVitalsPatient(null);
            setVitals({ weight: '', height: '', bmi: '', bloodPressure: '', pulse: '', temperature: '', spo2: '', respiratoryRate: '', chiefComplaint: '', notes: '' });
            fetchAllAppointments();
        } catch (err) {
            toast.error('Error saving vitals: ' + (err.response?.data?.message || err.message));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateStatus = (aptId, newStatus) => {
        setAppointments(prev => prev.map(a => a._id === aptId ? { ...a, status: newStatus } : a));
        setActiveMenuId(null);
        toast.success(`Status updated to ${newStatus}`);
    };

    const openVitalsForm = (apt) => {
        let existing = {};
        if (apt.clinicPatientId) {
            existing = apt.clinicPatientId.vitals || {};
            if (!existing.weight && apt.vitals) {
                existing = {
                    weight: apt.vitals.weight,
                    height: apt.vitals.height,
                    bmi: apt.vitals.bmi,
                    bloodPressure: apt.vitals.bp,
                    pulse: apt.vitals.pulse,
                    temperature: apt.vitals.temperature,
                    spo2: apt.vitals.spo2,
                    respiratoryRate: apt.vitals.rr
                };
            }
        } else {
            existing = apt.userId?.fertilityProfile?.vitals || {};
        }

        setVitals({
            weight: existing.weight || '',
            height: existing.height || '',
            bmi: existing.bmi || '',
            bloodPressure: existing.bloodPressure || existing.bp || '',
            pulse: existing.pulse || '',
            temperature: existing.temperature || '',
            spo2: existing.spo2 || '',
            respiratoryRate: existing.respiratoryRate || existing.rr || '',
            chiefComplaint: '',
            notes: ''
        });
        setVitalsPatient(apt);
    };

    // Clear all filters
    const clearAllFilters = () => {
        setSearchQuery('');
        setStatusFilter('all');
        setSortBy('latest');
        setFromDate('');
        setToDate('');
        setFilterPopoverOpen(false);
    };

    // Active filters count
    const activeFilterCount = 
        (statusFilter !== 'all' ? 1 : 0) +
        (sortBy !== 'latest' ? 1 : 0) +
        (fromDate ? 1 : 0) +
        (toDate ? 1 : 0);

    // Filtering & Sorting Logic
    const q = searchQuery.toLowerCase().trim();
    let filtered = appointments.filter(a => {
        const pName = a.userId?.name || a.clinicPatientId?.name || '';
        const pPhone = a.userId?.phone || a.clinicPatientId?.phone || '';
        const pId = a.userId?.patientId || a.clinicPatientId?.patientUid || a.patientId || a.userId?.mrn || '';
        const dName = a.doctorName || a.doctorId?.name || '';

        const matchesQuery = !q || (
            pName.toLowerCase().includes(q) ||
            pPhone.toLowerCase().includes(q) ||
            pId.toLowerCase().includes(q) ||
            dName.toLowerCase().includes(q)
        );

        const status = (a.status || 'confirmed').toLowerCase();
        const matchesStatus = statusFilter === 'all' || status === statusFilter.toLowerCase();

        // Date Range Filtering
        let matchesDateRange = true;
        if (fromDate || toDate) {
            const aptDate = a.appointmentDate ? new Date(a.appointmentDate) : null;
            if (aptDate && !isNaN(aptDate.getTime())) {
                const aptMidnight = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate()).getTime();
                if (fromDate) {
                    const fromMidnight = new Date(fromDate).setHours(0,0,0,0);
                    if (aptMidnight < fromMidnight) matchesDateRange = false;
                }
                if (toDate) {
                    const toMidnight = new Date(toDate).setHours(23,59,59,999);
                    if (aptMidnight > toMidnight) matchesDateRange = false;
                }
            } else {
                matchesDateRange = false;
            }
        }

        return matchesQuery && matchesStatus && matchesDateRange;
    });

    // Sorting
    if (sortBy === 'latest') {
        filtered.sort((a, b) => new Date(b.appointmentDate || 0) - new Date(a.appointmentDate || 0));
    } else if (sortBy === 'oldest') {
        filtered.sort((a, b) => new Date(a.appointmentDate || 0) - new Date(b.appointmentDate || 0));
    } else if (sortBy === 'name-asc') {
        filtered.sort((a, b) => {
            const nameA = a.userId?.name || a.clinicPatientId?.name || '';
            const nameB = b.userId?.name || b.clinicPatientId?.name || '';
            return nameA.localeCompare(nameB);
        });
    } else if (sortBy === 'name-desc') {
        filtered.sort((a, b) => {
            const nameA = a.userId?.name || a.clinicPatientId?.name || '';
            const nameB = b.userId?.name || b.clinicPatientId?.name || '';
            return nameB.localeCompare(nameA);
        });
    }

    const todayStr = new Date().toDateString();
    const todayAppts = filtered.filter(a =>
        a.appointmentDate && new Date(a.appointmentDate).toDateString() === todayStr
    );
    const displayList = activeTab === 'today' ? todayAppts : filtered;

    // Stat counts
    const totalPatientsUnique = new Set(appointments.map(a => a.userId?._id || a.clinicPatientId?._id || a.patientId || a.userId?.name)).size || appointments.length || 0;
    
    const upcomingAppointments = appointments.filter(a => {
        const d = new Date(a.appointmentDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        return d >= today && (a.status === 'pending' || a.status === 'confirmed');
    }).length;

    const completedToday = appointments.filter(a => 
        a.status === 'completed' && a.appointmentDate && new Date(a.appointmentDate).toDateString() === todayStr
    ).length;

    // Avatar Color cycling
    const avatarColors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

    // Format date for the banner
    const currentDate = new Date();
    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const todayIso = currentDate.toISOString().split('T')[0];

    return (
        <div className="doc-exact-patients-page">
            {error && <div className="doc-error-banner">⚠️ {error}</div>}

            {/* ─── 1. CLEAN HEALTHCARE SAAS BANNER (NO ADD PATIENT BUTTON) ─── */}
            <div className="doc-modern-banner">
                <div className="doc-banner-left">
                    <div className="doc-title-row">
                        <h1 className="doc-exact-title">Patient Queue & Consultations</h1>
                        <span className="doc-role-badge">DOCTOR</span>
                    </div>
                    <p className="doc-exact-subtitle">
                        Manage your patients, appointments and clinical records efficiently.
                    </p>
                </div>

                <div className="doc-banner-right">
                    <button 
                        type="button"
                        className={`doc-banner-refresh-btn ${refreshing ? 'is-refreshing' : ''}`}
                        onClick={handleManualRefresh}
                        title="Refresh appointments"
                        disabled={refreshing}
                    >
                        <FiRefreshCw className={`doc-banner-refresh-icon ${refreshing ? 'spin' : ''}`} size={16} />
                        <span className="doc-banner-refresh-text">Refresh</span>
                    </button>

                    <div className="doc-date-card">
                        <div className="doc-date-icon-wrap">
                            <FiCalendar className="doc-date-icon" />
                        </div>
                        <div className="doc-date-info">
                            <span className="doc-date-day">{dayName}</span>
                            <span className="doc-date-full">{formattedDate}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── 2. STATS ROW (3 SUMMARY CARDS) ─── */}
            <div className="doc-stats-grid">
                <div className="doc-stat-box stat-blue">
                    <div className="doc-stat-icon-wrapper">
                        <FiUsers className="doc-stat-svg-icon" />
                    </div>
                    <div className="doc-stat-data">
                        <div className="doc-stat-number">{totalPatientsUnique}</div>
                        <div className="doc-stat-title">Total Patients (Unique)</div>
                    </div>
                    <div className="doc-stat-watermark">
                        <FiUsers />
                    </div>
                </div>

                <div className="doc-stat-box stat-orange">
                    <div className="doc-stat-icon-wrapper">
                        <FiCalendar className="doc-stat-svg-icon" />
                    </div>
                    <div className="doc-stat-data">
                        <div className="doc-stat-number">{upcomingAppointments}</div>
                        <div className="doc-stat-title">Upcoming Appointments</div>
                    </div>
                    <div className="doc-stat-watermark">
                        <FiCalendar />
                    </div>
                </div>

                <div className="doc-stat-box stat-green">
                    <div className="doc-stat-icon-wrapper">
                        <FiCheckCircle className="doc-stat-svg-icon" />
                    </div>
                    <div className="doc-stat-data">
                        <div className="doc-stat-number">{completedToday}</div>
                        <div className="doc-stat-title">Completed Today</div>
                    </div>
                    <div className="doc-stat-watermark">
                        <FiTrendingUp />
                    </div>
                </div>
            </div>

            {/* ─── 3. CONSOLIDATED SLIM TOOLBAR: SEARCH + TABS + FILTER ─── */}
            <div className="doc-toolbar-card">
                {mobileSearchOpen ? (
                    <div className="doc-mobile-search-active-bar">
                        <div className="doc-search-pill-container mobile-active">
                            <FiSearch className="doc-search-pill-icon" />
                            <input
                                type="text"
                                placeholder="Search name, phone, MRN..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="doc-search-pill-input"
                                autoFocus
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="doc-search-clear-btn"
                                    title="Clear search"
                                    type="button"
                                >
                                    <FiX size={14} />
                                </button>
                            )}
                        </div>
                        <button 
                            type="button" 
                            className="doc-mobile-search-close-btn"
                            onClick={() => setMobileSearchOpen(false)}
                            title="Done searching"
                        >
                            <FiX size={16} />
                        </button>
                    </div>
                ) : (
                    <div className="doc-toolbar-main-row">
                        {/* Desktop Search Bar */}
                        <div className="doc-search-pill-container doc-desktop-only-search">
                            <FiSearch className="doc-search-pill-icon" />
                            <input
                                type="text"
                                placeholder="Search patient name, phone, MRN, or doctor..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="doc-search-pill-input"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="doc-search-clear-btn"
                                    title="Clear search"
                                    type="button"
                                >
                                    <FiX size={14} />
                                </button>
                            )}
                        </div>

                        {/* Mobile Search Icon Trigger Button (Shows only on mobile < 768px in ONE row) */}
                        <button 
                            type="button"
                            className={`doc-mobile-search-trigger-btn ${searchQuery ? 'has-query' : ''}`}
                            onClick={() => setMobileSearchOpen(true)}
                            title={searchQuery ? `Search active: "${searchQuery}"` : "Search patients"}
                        >
                            <FiSearch size={15} />
                            {searchQuery && <span className="doc-mobile-search-indicator" />}
                        </button>

                        {/* Centered Controls Group: Queue Tabs + Filter & Sort */}
                        <div className="doc-toolbar-controls-group">
                            <button 
                                type="button"
                                className={`doc-tab-pill ${activeTab === 'all' ? 'active' : ''}`}
                                onClick={() => setActiveTab('all')}
                            >
                                <FiCalendar size={14} />
                                <span>All Appointments</span>
                                <span className="doc-tab-count-badge">{filtered.length}</span>
                            </button>

                            <button 
                                type="button"
                                className={`doc-tab-pill ${activeTab === 'today' ? 'active' : ''}`}
                                onClick={() => setActiveTab('today')}
                            >
                                <FiClock size={14} />
                                <span>Today's Queue</span>
                                {todayAppts.length > 0 && (
                                    <span className="doc-tab-count-badge doc-queue-pulse">{todayAppts.length}</span>
                                )}
                            </button>

                            <button
                                type="button"
                                className={`doc-filter-trigger-btn ${filterPopoverOpen ? 'panel-open' : ''} ${activeFilterCount > 0 ? 'has-active-filters' : ''}`}
                                onClick={() => setFilterPopoverOpen(true)}
                                title="Filter & sort options"
                            >
                                <FiSliders size={14} />
                                <span>Filter & Sort</span>
                                {activeFilterCount > 0 && (
                                    <span className="doc-active-filter-badge">{activeFilterCount}</span>
                                )}
                            </button>

                            {activeFilterCount > 0 && (
                                <button 
                                    type="button"
                                    className="doc-clear-filters-quick-btn"
                                    onClick={clearAllFilters}
                                    title="Reset all active filters"
                                >
                                    <FiRotateCcw size={13} />
                                    <span>Reset</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* POPUP MODAL FILTER & SORT (Modal Popup with Backdrop like Reception Dashboard) */}
            {filterPopoverOpen && (
                <>
                    <div className="doc-filter-backdrop" onClick={() => setFilterPopoverOpen(false)} />
                    <div 
                        className="doc-filter-modal-card" 
                        role="dialog" 
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="doc-filter-modal-header">
                            <div className="doc-filter-title-wrap">
                                <div className="doc-filter-title-icon-wrap">
                                    <FiSliders />
                                </div>
                                <div className="doc-filter-title-text">
                                    <h4>Filter & Sort Patients</h4>
                                    <span className="doc-filter-subtitle">Refine queue by status, date or alphabetical order</span>
                                </div>
                                {activeFilterCount > 0 && (
                                    <span className="doc-active-filter-pill">{activeFilterCount} active</span>
                                )}
                            </div>

                            <button 
                                className="doc-filter-close-btn"
                                onClick={() => setFilterPopoverOpen(false)}
                                title="Close popup"
                                type="button"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        <div className="doc-filter-modal-body">
                            {/* 1. Sort Order */}
                            <div className="doc-filter-modal-section">
                                <label className="doc-filter-section-title">
                                    <span>Sort Order</span>
                                </label>
                                <div className="doc-filter-chips-grid">
                                    {[
                                        { id: 'latest', label: 'Newest → Oldest' },
                                        { id: 'oldest', label: 'Oldest → Newest' },
                                        { id: 'name-asc', label: 'Patient Name (A → Z)' },
                                        { id: 'name-desc', label: 'Patient Name (Z → A)' },
                                    ].map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={`doc-chip-btn ${sortBy === item.id ? 'active' : ''}`}
                                            onClick={() => setSortBy(item.id)}
                                        >
                                            <span>{item.label}</span>
                                            {sortBy === item.id && <FiCheck size={13} className="doc-chip-check" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Appointment Status */}
                            <div className="doc-filter-modal-section">
                                <label className="doc-filter-section-title">
                                    <span>Appointment Status</span>
                                </label>
                                <div className="doc-status-chips-wrap">
                                    {[
                                        { id: 'all', label: 'All Statuses', color: '#6366f1' },
                                        { id: 'confirmed', label: 'Confirmed', color: '#16a34a' },
                                        { id: 'completed', label: 'Completed', color: '#2563eb' },
                                        { id: 'pending', label: 'Pending', color: '#d97706' },
                                        { id: 'cancelled', label: 'Cancelled', color: '#dc2626' },
                                    ].map(st => (
                                        <button
                                            key={st.id}
                                            type="button"
                                            className={`doc-chip-btn ${statusFilter === st.id ? 'active' : ''}`}
                                            style={statusFilter === st.id ? { borderColor: st.color, color: st.color, background: `${st.color}14` } : {}}
                                            onClick={() => setStatusFilter(st.id)}
                                        >
                                            <span className="doc-status-dot" style={{ backgroundColor: st.color }} />
                                            <span>{st.label}</span>
                                            {statusFilter === st.id && <FiCheck size={13} className="doc-chip-check" />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 3. Date Range */}
                            <div className="doc-filter-modal-section">
                                <label className="doc-filter-section-title">
                                    <span>Appointment Date Range</span>
                                </label>
                                <div className="doc-date-range-modal-row">
                                    <div className="doc-date-field-group">
                                        <label>From Date</label>
                                        <input
                                            type="date"
                                            value={fromDate}
                                            max={todayIso}
                                            onChange={e => {
                                                if (e.target.value > todayIso) {
                                                    toast.error('Future dates cannot be selected');
                                                    return;
                                                }
                                                setFromDate(e.target.value);
                                            }}
                                            className="doc-date-picker-input"
                                        />
                                    </div>
                                    <div className="doc-date-field-group">
                                        <label>To Date</label>
                                        <input
                                            type="date"
                                            value={toDate}
                                            max={todayIso}
                                            onChange={e => {
                                                if (e.target.value > todayIso) {
                                                    toast.error('Future dates cannot be selected');
                                                    return;
                                                }
                                                setToDate(e.target.value);
                                            }}
                                            className="doc-date-picker-input"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="doc-filter-modal-footer">
                            <div className="doc-filter-footer-left">
                                {activeFilterCount > 0 && (
                                    <button onClick={clearAllFilters} className="doc-filter-reset-btn" type="button">
                                        <FiRotateCcw size={13} />
                                        <span>Reset All</span>
                                    </button>
                                )}
                                <span className="doc-match-count">
                                    Showing <strong>{displayList.length}</strong> matching appointments
                                </span>
                            </div>
                            <button 
                                className="doc-btn-apply-modal"
                                onClick={() => setFilterPopoverOpen(false)}
                                type="button"
                            >
                                <FiCheckCircle size={15} />
                                <span>Apply Filters</span>
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ─── 4. PATIENT APPOINTMENT CARDS ─── */}
            <div className="doc-cards-section">
                {loading ? (
                    <div className="doc-loading-container">
                        <div className="doc-custom-spinner" />
                        <p>Loading patient records...</p>
                    </div>
                ) : displayList.length === 0 ? (
                    <div className="doc-empty-box">
                        <div className="doc-empty-icon">👥</div>
                        <h3>No Patient Appointments Found</h3>
                        <p>
                            {searchQuery || activeFilterCount > 0
                                ? "No patients match your search or filter criteria. Try adjusting or clearing filters."
                                : "No patient appointments have been booked for this queue yet."}
                        </p>
                        {activeFilterCount > 0 && (
                            <button className="doc-btn-secondary" onClick={clearAllFilters} style={{ marginTop: '14px' }}>
                                Clear All Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="doc-patient-cards-grid" ref={menuRef}>
                        {displayList.map((apt, index) => {
                            const pName = apt.userId?.name || apt.clinicPatientId?.name || 'Walk-in Patient';
                            const pPhone = apt.userId?.phone || apt.clinicPatientId?.phone || '—';
                            const pEmail = apt.userId?.email || apt.clinicPatientId?.email || '';
                            const rawId = apt.userId?.mrn || apt.clinicPatientId?.mrn || apt.userId?.patientId || apt.clinicPatientId?.patientUid || apt.patientId || '—';
                            const pId = typeof rawId === 'string' ? rawId.replace(/^MRN[:\-\s]*/i, '') : rawId;
                            const dName = (apt.doctorName || apt.doctorId?.name || 'Assigned Doctor').replace(/^Dr\.?\s*/i, '');
                            
                            const aptDateObj = apt.appointmentDate ? new Date(apt.appointmentDate) : null;
                            const dateFormatted = aptDateObj && !isNaN(aptDateObj.getTime())
                                ? aptDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—';
                            const timeFormatted = apt.appointmentTime || '--:--';

                            const avatarBg = avatarColors[index % avatarColors.length];
                            const initial = (pName.trim().charAt(0) || 'P').toUpperCase();
                            const status = (apt.status || 'confirmed').toLowerCase();

                            return (
                                <div key={apt._id || index} className="doc-exact-card">
                                    {/* Primary Header of Card */}
                                    <div className="doc-card-top-row">
                                        <div className="doc-card-user-left">
                                            <div 
                                                className="doc-card-avatar"
                                                style={{ background: avatarBg }}
                                            >
                                                {initial}
                                            </div>
                                            <div className="doc-card-user-names">
                                                <h3 
                                                    className="doc-card-patient-name"
                                                    onClick={() => handleViewProfile(apt)}
                                                    title="Click to view full patient medical record"
                                                >
                                                    {pName}
                                                </h3>
                                                <div className="doc-card-patient-id">
                                                    MRN: {pId}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="doc-card-user-right">
                                            {/* 3 Dots Menu Button */}
                                            <div className="doc-card-menu-wrapper">
                                                <button 
                                                    className="doc-card-more-btn"
                                                    onClick={(e) => {
                                                         e.stopPropagation();
                                                         setActiveMenuId(activeMenuId === apt._id ? null : apt._id);
                                                    }}
                                                    title="More patient actions"
                                                >
                                                    <FiMoreHorizontal size={15} />
                                                </button>

                                                {activeMenuId === apt._id && (
                                                    <div className="doc-card-dropdown-menu">
                                                        <div 
                                                             className="doc-card-menu-action"
                                                             onClick={() => {
                                                                 setActiveMenuId(null);
                                                                 handleViewProfile(apt);
                                                             }}
                                                         >
                                                             <FiUserCheck size={14} />
                                                             <span>View Full Profile</span>
                                                         </div>

                                                         <div 
                                                             className="doc-card-menu-action"
                                                             onClick={() => {
                                                                 setActiveMenuId(null);
                                                                 openVitalsForm(apt);
                                                             }}
                                                         >
                                                             <FiActivity size={14} />
                                                             <span>Enter Vitals</span>
                                                         </div>

                                                         <div 
                                                             className="doc-card-menu-action"
                                                             onClick={() => {
                                                                 setActiveMenuId(null);
                                                                 setUploadPatient(apt);
                                                             }}
                                                         >
                                                             <FiUploadCloud size={14} />
                                                             <span>Upload Record</span>
                                                         </div>

                                                         <div className="doc-card-menu-divider" />

                                                         {status !== 'completed' && (
                                                             <div 
                                                                 className="doc-card-menu-action text-emerald-600"
                                                                 onClick={() => handleUpdateStatus(apt._id, 'completed')}
                                                             >
                                                                 <FiCheck size={14} />
                                                                 <span>Mark Completed</span>
                                                             </div>
                                                         )}

                                                         {status !== 'cancelled' && (
                                                             <div 
                                                                 className="doc-card-menu-action text-rose-600"
                                                                 onClick={() => handleUpdateStatus(apt._id, 'cancelled')}
                                                             >
                                                                 <FiX size={14} />
                                                                 <span>Cancel Appointment</span>
                                                             </div>
                                                         )}
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     </div>

                                     {/* Structured Patient Details Box (Clean: Date + Confirmed, Time, Doctor) */}
                                     <div className="doc-card-details-box">
                                         {/* Line 1: Date on Left, Status Badge on Right (where Time was) */}
                                         <div className="doc-card-date-status-row">
                                             <div className="doc-schedule-part">
                                                 <FiCalendar className="doc-detail-icon-mini icon-orange" />
                                                 <span className="doc-detail-mini-label">Date:</span>
                                                 <span className="doc-detail-mini-val font-semibold">{dateFormatted}</span>
                                             </div>

                                             <div className="doc-schedule-status-badge" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                 {['ready_for_doctor', 'ready'].includes(apt.preparationStatus) && (
                                                     <span style={{
                                                         background: '#d1fae5',
                                                         color: '#065f46',
                                                         border: '1px solid #a7f3d0',
                                                         padding: '2px 8px',
                                                         borderRadius: '12px',
                                                         fontSize: '10.5px',
                                                         fontWeight: 700,
                                                         display: 'inline-flex',
                                                         alignItems: 'center',
                                                         gap: '4px'
                                                     }}>
                                                         🩺 Prepped
                                                     </span>
                                                 )}
                                                 <span className={`doc-status-pill status-${status}`}>
                                                     {status === 'completed' ? 'Completed' : status === 'confirmed' ? 'Confirmed' : status === 'pending' ? 'Pending' : status}
                                                 </span>
                                             </div>
                                         </div>

                                         {/* Line 2: Appointment Time (where Confirmed was) */}
                                         <div className="doc-card-time-row">
                                             <FiClock className="doc-detail-icon-mini icon-teal" />
                                             <span className="doc-detail-mini-label">Time:</span>
                                             <span className="doc-time-badge">{timeFormatted && timeFormatted !== '--:--' ? timeFormatted : '09:00 AM'}</span>
                                         </div>

                                         {/* Line 3: Doctor Name */}
                                         <div className="doc-card-doctor-line">
                                             <FaUserMd className="doc-detail-icon-mini icon-doctor" />
                                             <span className="doc-detail-mini-label">Doctor:</span>
                                             <span className="doc-detail-mini-val font-doctor">Dr. {dName}</span>
                                         </div>
                                     </div>

                                    {/* Card Footer Actions (View Profile & Consult) */}
                                    <div className="doc-card-actions-row">
                                        <button 
                                            className="doc-action-btn btn-profile"
                                            onClick={() => handleViewProfile(apt)}
                                            title="View complete patient medical history"
                                        >
                                            <FiUser size={13} />
                                            <span>View Profile</span>
                                        </button>

                                        <button 
                                            className="doc-action-btn btn-consult"
                                            onClick={() => {
                                                const ptName = (pName || 'Walk-in').replace(/\s+/g, '-');
                                                const patientMRN = pId && pId !== '—' ? pId : ptName;
                                                navigate(`/doctor/patient/${patientMRN}`, { state: { appointmentId: apt._id } });
                                            }}
                                            title="Start clinical consultation"
                                        >
                                            <FiFileText size={13} />
                                            <span>Consult</span>
                                            <FiArrowRight size={12} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─── 5. VITALS MODAL ─── */}
            {vitalsPatient && (
                <div className="doc-modal-overlay" onClick={() => setVitalsPatient(null)}>
                    <div className="doc-modal-box" onClick={e => e.stopPropagation()}>
                        <div className="doc-modal-header">
                            <div>
                                <h2 className="doc-modal-title">💉 Enter Vitals</h2>
                                <p className="doc-modal-subtitle">
                                    Patient: <strong>{vitalsPatient.userId?.name || vitalsPatient.clinicPatientId?.name || 'Unknown'}</strong> •
                                    ID: {vitalsPatient.userId?.patientId || vitalsPatient.clinicPatientId?.patientUid || 'N/A'}
                                </p>
                            </div>
                            <button className="doc-modal-close" onClick={() => setVitalsPatient(null)}>✕</button>
                        </div>

                        <div className="doc-modal-body">
                            <div className="doc-form-grid">
                                {[
                                    { key: 'weight', label: 'Weight (kg)', icon: '⚖️', type: 'number' },
                                    { key: 'height', label: 'Height (cm)', icon: '📏', type: 'number' },
                                    { key: 'bmi', label: 'BMI (auto)', icon: '📊', type: 'text', readOnly: true },
                                    { key: 'bloodPressure', label: 'Blood Pressure', icon: '🩸', type: 'text', placeholder: '120/80' },
                                    { key: 'pulse', label: 'Pulse (bpm)', icon: '💓', type: 'number' },
                                    { key: 'temperature', label: 'Temp (°F)', icon: '🌡️', type: 'number' },
                                    { key: 'spo2', label: 'SpO₂ (%)', icon: '🫁', type: 'number' },
                                    { key: 'respiratoryRate', label: 'Resp Rate (/min)', icon: '💨', type: 'number' },
                                ].map(field => (
                                    <div key={field.key} className="doc-form-group">
                                        <label className="doc-form-label">{field.icon} {field.label}</label>
                                        <input
                                            type={field.type}
                                            value={vitals[field.key]}
                                            readOnly={field.readOnly}
                                            placeholder={field.placeholder || ''}
                                            onChange={e => setVitals({ ...vitals, [field.key]: e.target.value })}
                                            className={`doc-form-input ${field.readOnly ? 'bg-slate-100 text-slate-500' : ''}`}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="doc-form-group" style={{ marginTop: '16px' }}>
                                <label className="doc-form-label">📋 Chief Complaint</label>
                                <textarea
                                    value={vitals.chiefComplaint}
                                    onChange={e => setVitals({ ...vitals, chiefComplaint: e.target.value })}
                                    placeholder="Patient's chief complaint..."
                                    className="doc-form-textarea"
                                />
                            </div>

                            <div className="doc-form-group" style={{ marginTop: '12px' }}>
                                <label className="doc-form-label">📝 Clinical / Nurse Notes</label>
                                <textarea
                                    value={vitals.notes}
                                    onChange={e => setVitals({ ...vitals, notes: e.target.value })}
                                    placeholder="Any clinical observations or notes..."
                                    className="doc-form-textarea"
                                />
                            </div>
                        </div>

                        <div className="doc-modal-footer">
                            <button className="doc-btn-secondary" onClick={() => setVitalsPatient(null)}>Cancel</button>
                            <button
                                className="doc-btn-primary"
                                onClick={handleSaveVitals}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : 'Save Vitals'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 6. UPLOAD RECORD MODAL ─── */}
            {uploadPatient && (
                <div className="doc-modal-overlay" onClick={() => setUploadPatient(null)}>
                    <div className="doc-modal-box doc-modal-sm" onClick={e => e.stopPropagation()}>
                        <div className="doc-modal-header">
                            <div>
                                <h2 className="doc-modal-title">📁 Upload Medical Record</h2>
                                <p className="doc-modal-subtitle">
                                    Patient: <strong>{uploadPatient.userId?.name || 'Patient'}</strong>
                                </p>
                            </div>
                            <button className="doc-modal-close" onClick={() => setUploadPatient(null)}>✕</button>
                        </div>
                        <form onSubmit={handleUploadReport} className="doc-modal-body">
                            <p className="text-sm text-slate-600 mb-4">
                                Upload previous medical reports, prescriptions, or imaging scans.
                            </p>
                            
                            <div className="doc-dropzone">
                                <FiUploadCloud size={32} className="text-blue-500 mb-2" />
                                <input 
                                    type="file" 
                                    accept="application/pdf,image/*"
                                    onChange={(e) => setUploadFile(e.target.files[0])}
                                    required
                                    className="doc-file-input"
                                />
                                <div className="text-xs text-slate-500 mt-2">
                                    {uploadFile ? uploadFile.name : 'Select PDF or image file from computer'}
                                </div>
                            </div>

                            <div className="doc-modal-footer" style={{ padding: '16px 0 0', border: 'none' }}>
                                <button type="button" onClick={() => setUploadPatient(null)} className="doc-btn-secondary">Cancel</button>
                                <button type="submit" disabled={uploading || !uploadFile} className="doc-btn-primary">
                                    {uploading ? 'Uploading...' : 'Save Record'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Patient;