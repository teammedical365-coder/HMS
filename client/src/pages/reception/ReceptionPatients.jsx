import React, { useState, useEffect, useMemo, useDeferredValue, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI, patientAPI, reportAPI } from '../../utils/api';
import { useAuth } from '../../store/hooks';
import { 
    FiSearch, FiUsers, FiCalendar, FiActivity, FiFileText, FiSliders, 
    FiPhone, FiEye, FiCheckCircle, FiX, FiRefreshCw
} from 'react-icons/fi';
import './ReceptionDashboard.css';
import toast from 'react-hot-toast';

// Client-side cache keys
const CACHE_KEY_APPTS = 'hms_rec_cached_appts';
const CACHE_KEY_PTS = 'hms_rec_cached_pts';

const PAGE_CHUNK_SIZE = 10;

const ReceptionPatients = () => {
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();

    // Instant SWR Cache Initialization
    const [appointments, setAppointments] = useState(() => {
        try {
            const cached = sessionStorage.getItem(CACHE_KEY_APPTS);
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });

    const [patients, setPatients] = useState(() => {
        try {
            const cached = sessionStorage.getItem(CACHE_KEY_PTS);
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });

    // Loading states
    const [loadingAppts, setLoadingAppts] = useState(() => appointments.length === 0);
    const [loadingPatients, setLoadingPatients] = useState(() => patients.length === 0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Search and tab states
    const [searchText, setSearchText] = useState('');
    const deferredSearch = useDeferredValue(searchText);
    const [activeTab, setActiveTab] = useState('all'); // 'today' or 'all'

    // Advanced Filter states
    const [filterDoctor, setFilterDoctor] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDepartment, setFilterDepartment] = useState('all');
    const [showFilterPopover, setShowFilterPopover] = useState(false);
    const filterPopoverRef = useRef(null);

    // Live Real-Time Clock & Pulse
    const [currentTime, setCurrentTime] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Progressive Lazy Loading Window (Initial 10 items)
    const [visibleCount, setVisibleCount] = useState(PAGE_CHUNK_SIZE);
    const loadMoreRef = useRef(null);

    // Modals state
    const [uploadModal, setUploadModal] = useState({ open: false, apptId: null, patientName: '', patientId: null });
    const [selectedReportFile, setSelectedReportFile] = useState(null);
    const [uploadingReport, setUploadingReport] = useState(false);
    const [profileModal, setProfileModal] = useState({ open: false, patient: null });

    // Close filter popover on outside click
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target)) {
                setShowFilterPopover(false);
            }
        };
        if (showFilterPopover) {
            document.addEventListener('mousedown', handleOutsideClick);
        }
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [showFilterPopover]);

    // Background Fresh Data Fetching (Stale-While-Revalidate)
    const fetchAppointments = useCallback(async () => {
        try {
            const res = await receptionAPI.getAllAppointments({ all: 'true' });
            if (res?.success) {
                const apptsData = res.appointments || [];
                setAppointments(apptsData);
                try {
                    sessionStorage.setItem(CACHE_KEY_APPTS, JSON.stringify(apptsData));
                } catch (e) {}
            }
        } catch (error) {
            console.error("Error fetching appointments:", error);
        } finally {
            setLoadingAppts(false);
        }
    }, []);

    const fetchRecentPatients = useCallback(async () => {
        try {
            const res = await receptionAPI.getAllPatients();
            if (res?.success) {
                const ptsData = res.patients || [];
                setPatients(ptsData);
                try {
                    sessionStorage.setItem(CACHE_KEY_PTS, JSON.stringify(ptsData));
                } catch (e) {}
            }
        } catch (error) {
            console.error("Error fetching patients:", error);
        } finally {
            setLoadingPatients(false);
        }
    }, []);

    useEffect(() => {
        fetchAppointments();
        fetchRecentPatients();
    }, [fetchAppointments, fetchRecentPatients]);

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([fetchAppointments(), fetchRecentPatients()]);
            toast.success('Queue refreshed with latest records!', { id: 'rec-refresh-toast', duration: 2500 });
        } catch (e) {
            toast.error('Failed to refresh records');
        } finally {
            setTimeout(() => setIsRefreshing(false), 500);
        }
    };

    // Reset pagination on search, tab switch, or filter changes
    useEffect(() => {
        setVisibleCount(PAGE_CHUNK_SIZE);
    }, [deferredSearch, activeTab, filterDoctor, filterStatus, filterDepartment]);

    // Infinite Scroll Intersection Observer
    useEffect(() => {
        if (!loadMoreRef.current) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                setVisibleCount(prev => prev + PAGE_CHUNK_SIZE);
            }
        }, { threshold: 0.1, rootMargin: '100px' });

        observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [appointments.length]);

    const formatDate = useCallback((dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }, []);

    const getInitialBgColor = useCallback((name = '') => {
        const colors = [
            'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
            'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
            'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
        ];
        let sum = 0;
        for (let i = 0; i < name.length; i++) {
            sum += name.charCodeAt(i);
        }
        return colors[sum % colors.length];
    }, []);

    const handleReportSubmit = useCallback(async (e) => {
        e.preventDefault();
        if (!selectedReportFile || !uploadModal.apptId) return;
        setUploadingReport(true);
        try {
            const formData = new FormData();
            formData.append('reportFile', selectedReportFile);
            formData.append('appointmentId', uploadModal.apptId);
            const res = await reportAPI.uploadReport(formData);
            if (res?.success) {
                toast.success('Report uploaded successfully!');
                setUploadModal({ open: false, apptId: null, patientName: '', patientId: null });
            } else {
                toast.error(res?.message || 'Failed to upload report.');
            }
        } catch (err) {
            toast.error('Error uploading report.');
        } finally {
            setUploadingReport(false);
        }
    }, [selectedReportFile, uploadModal]);

    const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    const uniqueDoctors = useMemo(() => {
        const docMap = new Map();
        appointments.forEach(a => {
            const name = a.doctorId?.name || a.doctorName;
            const id = a.doctorId?._id || a.doctorId || name;
            if (name && id && !docMap.has(name)) docMap.set(name, { id, name });
        });
        return Array.from(docMap.values());
    }, [appointments]);

    const uniqueDepartments = useMemo(() => {
        const depts = new Set();
        appointments.forEach(a => {
            const d = a.department || a.serviceName;
            if (d && d.trim()) depts.add(d.trim());
        });
        return Array.from(depts);
    }, [appointments]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filterDoctor !== 'all') count++;
        if (filterStatus !== 'all') count++;
        if (filterDepartment !== 'all') count++;
        return count;
    }, [filterDoctor, filterStatus, filterDepartment]);

    const handleResetFilters = () => {
        setFilterDoctor('all');
        setFilterStatus('all');
        setFilterDepartment('all');
        setSearchText('');
    };

    const { totalPatientsCount, upcomingApptsCount, completedTodayCount, pendingBillsCount } = useMemo(() => {
        const totalPatients = patients.length || appointments.length || 0;
        const upcoming = appointments.filter(a => {
            const isFuture = a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] >= todayStr;
            return isFuture && ['pending', 'confirmed', 'scheduled', 'in_progress'].includes(a.status);
        }).length;
        const completedToday = appointments.filter(a => {
            const isToday = a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] === todayStr;
            return isToday && a.status === 'completed';
        }).length;
        const pendingBills = appointments.filter(a => ['Pending', 'pending'].includes(a.paymentStatus) || !a.isPaid).length;
        return { totalPatientsCount: totalPatients, upcomingApptsCount: upcoming, completedTodayCount: completedToday, pendingBillsCount: pendingBills };
    }, [patients, appointments, todayStr]);

    const { completedCount, upcomingCount, cancelledCount, totalActivityCount, completedPct, upcomingPct, cancelledPct } = useMemo(() => {
        const completed = appointments.filter(a => a.status === 'completed').length;
        const upcoming = appointments.filter(a => ['pending', 'confirmed', 'scheduled', 'in_progress', 'with_doctor'].includes(a.status)).length;
        const cancelled = appointments.filter(a => a.status === 'cancelled').length;
        const total = (completed + upcoming + cancelled) || 1;
        const cPct = Math.round((completed / total) * 100);
        const uPct = Math.round((upcoming / total) * 100);
        const canPct = Math.max(0, 100 - (cPct + uPct));
        return {
            completedCount: completed,
            upcomingCount: upcoming,
            cancelledCount: cancelled,
            totalActivityCount: completed + upcoming + cancelled,
            completedPct: cPct,
            upcomingPct: uPct,
            cancelledPct: canPct
        };
    }, [appointments]);

    const filteredAppointments = useMemo(() => {
        return appointments.filter(appt => {
            if (activeTab === 'today') {
                const isToday = appt.appointmentDate && new Date(appt.appointmentDate).toISOString().split('T')[0] === todayStr;
                if (!isToday) return false;
            }
            if (filterDoctor !== 'all') {
                const docName = appt.doctorId?.name || appt.doctorName || '';
                const docId = appt.doctorId?._id || appt.doctorId || '';
                if (filterDoctor !== docName && filterDoctor !== docId) return false;
            }
            if (filterStatus !== 'all') {
                const st = (appt.status || '').toLowerCase();
                if (filterStatus === 'pending' && !['pending', 'confirmed', 'scheduled'].includes(st)) return false;
                if (filterStatus === 'completed' && st !== 'completed') return false;
                if (filterStatus === 'in_progress' && !['in_progress', 'with_doctor'].includes(st)) return false;
                if (filterStatus === 'cancelled' && st !== 'cancelled') return false;
            }
            if (filterDepartment !== 'all') {
                const dept = appt.department || appt.serviceName || '';
                if (dept.toLowerCase() !== filterDepartment.toLowerCase()) return false;
            }
            if (deferredSearch.trim().length > 0) {
                const q = deferredSearch.toLowerCase();
                return String(appt.userId?.name || appt.patientName || '').toLowerCase().includes(q) ||
                       String(appt.userId?.phone || appt.patientPhone || '').includes(q) ||
                       String(appt.userId?.patientId || appt.patientId || '').toLowerCase().includes(q) ||
                       String(appt.doctorId?.name || appt.doctorName || '').toLowerCase().includes(q);
            }
            return true;
        });
    }, [appointments, activeTab, deferredSearch, todayStr, filterDoctor, filterStatus, filterDepartment]);

    const visibleAppointments = useMemo(() => filteredAppointments.slice(0, visibleCount), [filteredAppointments, visibleCount]);

    return (
        <div className="reception-dashboard rec-exact-main-wrap">
            {/* 1. UNIFIED HERO: TODAY'S ACTIVITY (LEFT) + 4 STAT CARDS 2x2 (RIGHT) */}
            <div className="rec-unified-hero-section">
                {/* 1. Today's Activity (Donut Chart & Legend) - No Show Removed */}
                <div className="rec-bottom-card rec-activity-card rec-activity-unified">
                    <h3 className="rec-bottom-card-title">Today's Activity</h3>
                    <div className="rec-activity-body">
                        <div className="rec-donut-wrapper">
                            <svg viewBox="0 0 100 100" className="rec-donut-svg">
                                <circle cx="50" cy="50" r="38" className="rec-donut-bg-ring" />
                                <circle
                                    cx="50" cy="50" r="38"
                                    className="rec-donut-seg rec-seg-completed"
                                    strokeDasharray={`${completedPct * 2.38} 238.76`}
                                    strokeDashoffset="0"
                                />
                                <circle
                                    cx="50" cy="50" r="38"
                                    className="rec-donut-seg rec-seg-upcoming"
                                    strokeDasharray={`${upcomingPct * 2.38} 238.76`}
                                    strokeDashoffset={`-${completedPct * 2.38}`}
                                />
                                <circle
                                    cx="50" cy="50" r="38"
                                    className="rec-donut-seg rec-seg-cancelled"
                                    strokeDasharray={`${cancelledPct * 2.38} 238.76`}
                                    strokeDashoffset={`-${(completedPct + upcomingPct) * 2.38}`}
                                />
                            </svg>
                            <div className="rec-donut-center-text">
                                <span className="rec-donut-total-num">{totalActivityCount}</span>
                                <span className="rec-donut-total-label">Total</span>
                            </div>
                        </div>

                        <div className="rec-activity-legend">
                            <div className="rec-legend-item">
                                <span className="rec-legend-dot rec-dot-completed" />
                                <span className="rec-legend-label">Completed</span>
                                <span className="rec-legend-val">{completedCount} ({completedPct}%)</span>
                            </div>
                            <div className="rec-legend-item">
                                <span className="rec-legend-dot rec-dot-upcoming" />
                                <span className="rec-legend-label">Upcoming</span>
                                <span className="rec-legend-val">{upcomingCount} ({upcomingPct}%)</span>
                            </div>
                            <div className="rec-legend-item">
                                <span className="rec-legend-dot rec-dot-cancelled" />
                                <span className="rec-legend-label">Cancelled</span>
                                <span className="rec-legend-val">{cancelledCount} ({cancelledPct}%)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. 4 Stat Cards in 2x2 Grid next to Today's Activity */}
                <div className="rec-kpi-grid-2x2">
                    {/* Top Row - Card 1: Total Patients */}
                    <div className="rec-exact-kpi-card rec-kpi-theme-purple" onClick={() => { setActiveTab('all'); setSearchText(''); }}>
                        <div className="rec-kpi-top-glow" />
                        <div className="rec-kpi-card-inner">
                            <div className="rec-kpi-icon-box rec-kpi-icon-purple">
                                <FiUsers />
                            </div>
                            <div className="rec-kpi-text-info">
                                <div className="rec-kpi-val-row">
                                    <span className="rec-kpi-val">{totalPatientsCount}</span>
                                    <span className="rec-kpi-mini-tag rec-tag-purple">● Registered</span>
                                </div>
                                <span className="rec-kpi-name">Total Patients</span>
                            </div>
                        </div>
                        <div className="rec-kpi-wave-box">
                            <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                                <path d="M0,18 Q25,2 50,14 T100,6" fill="none" stroke="#8b5cf6" strokeWidth="2.5" className="rec-sparkline-path" />
                                <path d="M0,18 Q25,2 50,14 T100,6 L100,24 L0,24 Z" fill="url(#purpleGradWave)" opacity="0.18" />
                                <defs>
                                    <linearGradient id="purpleGradWave" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8b5cf6" />
                                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    {/* Top Row - Card 2: Upcoming Appointments */}
                    <div className="rec-exact-kpi-card rec-kpi-theme-amber" onClick={() => setActiveTab('today')}>
                        <div className="rec-kpi-top-glow" />
                        <div className="rec-kpi-card-inner">
                            <div className="rec-kpi-icon-box rec-kpi-icon-amber">
                                <FiCalendar />
                            </div>
                            <div className="rec-kpi-text-info">
                                <div className="rec-kpi-val-row">
                                    <span className="rec-kpi-val">{upcomingApptsCount}</span>
                                    <span className="rec-kpi-mini-tag rec-tag-amber">● In Queue</span>
                                </div>
                                <span className="rec-kpi-name">Upcoming Appts</span>
                            </div>
                        </div>
                        <div className="rec-kpi-wave-box">
                            <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                                <path d="M0,16 Q25,22 50,8 T100,12" fill="none" stroke="#f59e0b" strokeWidth="2.5" className="rec-sparkline-path" />
                                <path d="M0,16 Q25,22 50,8 T100,12 L100,24 L0,24 Z" fill="url(#amberGradWave)" opacity="0.18" />
                                <defs>
                                    <linearGradient id="amberGradWave" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f59e0b" />
                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    {/* Bottom Row - Card 3: Completed Today */}
                    <div className="rec-exact-kpi-card rec-kpi-theme-mint" onClick={() => { setActiveTab('today'); setFilterStatus('completed'); }}>
                        <div className="rec-kpi-top-glow" />
                        <div className="rec-kpi-card-inner">
                            <div className="rec-kpi-icon-box rec-kpi-icon-mint">
                                <FiActivity />
                            </div>
                            <div className="rec-kpi-text-info">
                                <div className="rec-kpi-val-row">
                                    <span className="rec-kpi-val">{completedTodayCount}</span>
                                    <span className="rec-kpi-mini-tag rec-tag-mint">● {completedPct}% Done</span>
                                </div>
                                <span className="rec-kpi-name">Completed Today</span>
                            </div>
                        </div>
                        <div className="rec-kpi-wave-box">
                            <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                                <path d="M0,14 Q25,4 50,18 T100,4" fill="none" stroke="#10b981" strokeWidth="2.5" className="rec-sparkline-path" />
                                <path d="M0,14 Q25,4 50,18 T100,4 L100,24 L0,24 Z" fill="url(#mintGradWave)" opacity="0.18" />
                                <defs>
                                    <linearGradient id="mintGradWave" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    {/* Bottom Row - Card 4: Pending Bills */}
                    <div className="rec-exact-kpi-card rec-kpi-theme-blue" onClick={() => navigate('/billing/patient')}>
                        <div className="rec-kpi-top-glow" />
                        <div className="rec-kpi-card-inner">
                            <div className="rec-kpi-icon-box rec-kpi-icon-blue">
                                <FiFileText />
                            </div>
                            <div className="rec-kpi-text-info">
                                <div className="rec-kpi-val-row">
                                    <span className="rec-kpi-val">{pendingBillsCount}</span>
                                    <span className="rec-kpi-mini-tag rec-tag-blue">● Unpaid</span>
                                </div>
                                <span className="rec-kpi-name">Pending Bills</span>
                            </div>
                        </div>
                        <div className="rec-kpi-wave-box">
                            <svg viewBox="0 0 100 24" preserveAspectRatio="none">
                                <path d="M0,10 Q25,18 50,6 T100,16" fill="none" stroke="#3b82f6" strokeWidth="2.5" className="rec-sparkline-path" />
                                <path d="M0,10 Q25,18 50,6 T100,16 L100,24 L0,24 Z" fill="url(#blueGradWave)" opacity="0.18" />
                                <defs>
                                    <linearGradient id="blueGradWave" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. SEARCH & GLASSMORPHISM FILTER BAR */}
            <div className="rec-exact-search-bar-row">
                <div className="rec-search-input-wrapper">
                    <FiSearch className="rec-search-icon" />
                    <input 
                        type="text" 
                        placeholder="Search patient by name, phone, MRN, or doctor..." 
                        value={searchText} 
                        onChange={e => setSearchText(e.target.value)} 
                        className="rec-search-input-field" 
                    />
                    {searchText && (
                        <button className="rec-search-clear-btn" onClick={() => setSearchText('')} title="Clear search">
                            <FiX />
                        </button>
                    )}
                </div>

                <div className="rec-toggle-tabs-wrap">
                    <button 
                        className={`rec-tab-toggle-btn ${activeTab === 'today' ? 'active-queue-tab' : ''}`} 
                        onClick={() => setActiveTab('today')}
                    >
                        <span>Today's Queue</span>
                        <span className="rec-tab-count-pill">{appointments.filter(a => a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] === todayStr).length}</span>
                    </button>
                    <button 
                        className={`rec-tab-toggle-btn ${activeTab === 'all' ? 'active-all-tab' : ''}`} 
                        onClick={() => setActiveTab('all')}
                    >
                        <span>All Appointments</span>
                        <span className="rec-tab-count-pill">{appointments.length}</span>
                    </button>

                    {/* ULTRA-MODERN FILTER BUTTON & CENTERED MODAL */}
                    <div className="rec-filter-btn-container" ref={filterPopoverRef}>
                        <button 
                            className={`rec-filter-icon-btn ${activeFilterCount > 0 ? 'filter-active' : ''}`} 
                            onClick={() => setShowFilterPopover(prev => !prev)}
                            title="Filter Appointments"
                        >
                            <FiSliders />
                            {activeFilterCount > 0 && <span className="rec-filter-count-badge">{activeFilterCount}</span>}
                        </button>

                        {showFilterPopover && (
                            <>
                                <div className="rec-filter-backdrop" onClick={() => setShowFilterPopover(false)} />
                                <div className="rec-filter-popover-card">
                                    <div className="rec-filter-popover-header">
                                        <div className="rec-filter-title-wrap">
                                            <div className="rec-filter-title-icon"><FiSliders /></div>
                                            <div>
                                                <h4>Filter Queue</h4>
                                                <span className="rec-filter-subtitle">Refine appointment records</span>
                                            </div>
                                        </div>
                                        <button className="rec-filter-close-btn" onClick={() => setShowFilterPopover(false)}>
                                            <FiX />
                                        </button>
                                    </div>

                                    <div className="rec-filter-popover-body">
                                        {/* Status Filter Chips */}
                                        <div className="rec-filter-group">
                                            <label className="rec-filter-label">Appointment Status</label>
                                            <div className="rec-status-chips-grid">
                                                {[
                                                    { key: 'all', label: 'All Statuses', color: '#6366f1' },
                                                    { key: 'pending', label: 'Scheduled', color: '#2563eb' },
                                                    { key: 'in_progress', label: 'In Progress', color: '#d97706' },
                                                    { key: 'completed', label: 'Completed', color: '#059669' },
                                                    { key: 'cancelled', label: 'Cancelled', color: '#dc2626' }
                                                ].map(chip => (
                                                    <button
                                                        key={chip.key}
                                                        type="button"
                                                        className={`rec-chip-btn ${filterStatus === chip.key ? 'chip-active' : ''}`}
                                                        style={filterStatus === chip.key ? { borderColor: chip.color, color: chip.color, background: `${chip.color}14` } : {}}
                                                        onClick={() => setFilterStatus(chip.key)}
                                                    >
                                                        <span className="rec-chip-dot" style={{ backgroundColor: chip.color }} />
                                                        {chip.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Doctor Filter */}
                                        <div className="rec-filter-group">
                                            <label className="rec-filter-label">Attending Doctor</label>
                                            <select 
                                                value={filterDoctor} 
                                                onChange={e => setFilterDoctor(e.target.value)} 
                                                className="rec-filter-select"
                                            >
                                                <option value="all">👨‍⚕️ All Doctors</option>
                                                {uniqueDoctors.map(doc => (
                                                    <option key={doc.id} value={doc.name}>Dr. {doc.name.replace(/^Dr\.?\s*/i, '')}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Department Filter */}
                                        {uniqueDepartments.length > 0 && (
                                            <div className="rec-filter-group">
                                                <label className="rec-filter-label">Medical Department</label>
                                                <select 
                                                    value={filterDepartment} 
                                                    onChange={e => setFilterDepartment(e.target.value)} 
                                                    className="rec-filter-select"
                                                >
                                                    <option value="all">🏥 All Departments</option>
                                                    {uniqueDepartments.map(dept => (
                                                        <option key={dept} value={dept}>{dept}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>

                                    <div className="rec-filter-popover-footer">
                                        <button type="button" className="rec-filter-reset-btn" onClick={handleResetFilters}>
                                            <FiRefreshCw style={{ marginRight: '5px' }} /> Reset All
                                        </button>
                                        <button type="button" className="rec-filter-apply-btn" onClick={() => setShowFilterPopover(false)}>
                                            <FiCheckCircle style={{ marginRight: '5px' }} /> Apply ({filteredAppointments.length})
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* 4. APPOINTMENTS TABLE CARD */}
            <div className="rec-exact-table-card">
                <div className="rec-table-card-header">
                    <div className="rec-table-header-title">
                        <FiCalendar className="rec-table-icon" />
                        <h3>{activeTab === 'today' ? "Today's Patient Queue" : "All Appointments"}</h3>
                        <span className="rec-table-count-badge">{filteredAppointments.length} Total</span>
                    </div>

                    <div className="rec-table-header-actions">
                        <button 
                            className="rec-btn-refresh-table" 
                            onClick={handleManualRefresh} 
                            disabled={isRefreshing}
                            title="Refresh Table Records"
                        >
                            <FiRefreshCw className={isRefreshing ? 'rec-spin' : ''} />
                            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>
                    </div>
                </div>

                <div className="rec-table-responsive">
                    <table className="rec-exact-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>PATIENT</th>
                                <th>CONTACT</th>
                                <th>DOCTOR</th>
                                <th>TIME</th>
                                <th>DATE</th>
                                <th>STATUS</th>
                                <th style={{ textAlign: 'center' }}>ACTION</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loadingAppts && appointments.length === 0 ? (
                                Array.from({ length: 5 }).map((_, idx) => (
                                    <tr key={idx} className="rec-skeleton-row">
                                        <td><div className="rec-skeleton-line" style={{ width: '20px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '130px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '90px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '110px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '60px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '80px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '75px' }} /></td>
                                        <td><div className="rec-skeleton-line" style={{ width: '60px', margin: '0 auto' }} /></td>
                                    </tr>
                                ))
                            ) : visibleAppointments.length === 0 ? (
                                <tr>
                                    <td colSpan="8" style={{ padding: 0, border: 'none' }}>
                                        <div className="rec-empty-filter-state">
                                            <div className="rec-empty-filter-icon-circle">
                                                <FiSliders />
                                            </div>
                                            <h4>No Appointments Matching Filter</h4>
                                            <p>We couldn't find any appointment records matching your selected status, doctor, or department.</p>
                                            <button 
                                                type="button" 
                                                className="rec-empty-filter-reset-btn" 
                                                onClick={() => { setSearchText(''); handleResetFilters(); }}
                                            >
                                                <FiRefreshCw style={{ fontSize: '13px' }} />
                                                <span>Reset Filters & Show All Records</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                visibleAppointments.map((appt, idx) => {
                                    const rawPt = appt.userId || {};
                                    const clinicPt = appt.clinicPatientId || {};
                                    const patientName = appt.patientName || clinicPt.name || rawPt.name || 'Unknown Patient';
                                    const patientPhone = appt.patientPhone || clinicPt.phone || rawPt.phone || '-';
                                    const patientMRN = appt.patientId || clinicPt.patientUid || rawPt.patientId || 'CIT-M365-NEW';
                                    const doctorName = appt.doctorName || appt.doctorId?.name || 'Dr. Assigned';
                                    const doctorDept = appt.department || appt.serviceName || appt.doctorId?.department || 'General';
                                    const apptTime = appt.appointmentTime || '09:00';
                                    const apptDateFormatted = appt.appointmentDate ? new Date(appt.appointmentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today';
                                    const statusStr = (appt.status || 'pending').toLowerCase();

                                    return (
                                        <tr key={appt._id || idx} className="rec-table-row">
                                            <td className="rec-td-index">{idx + 1}</td>
                                            <td>
                                                <div 
                                                    className="rec-patient-cell" 
                                                    onClick={() => {
                                                        const pid = (typeof appt.userId === 'object' ? (appt.userId?._id || appt.userId?.patientId) : appt.userId) || appt.patientId || appt._id;
                                                        if (pid) {
                                                            navigate(`/patient/${pid}/department/${encodeURIComponent(appt.department || appt.serviceName || 'Unassigned')}`);
                                                        } else {
                                                            setProfileModal({ open: true, patient: appt.userId || appt });
                                                        }
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                    title="Click to view Patient Profile"
                                                >
                                                    <div 
                                                        className="rec-patient-avatar"
                                                        style={{ background: getInitialBgColor(patientName) }}
                                                    >
                                                        {patientName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="rec-patient-info-col">
                                                        <span className="rec-patient-name" style={{ textDecoration: 'underline', textDecorationColor: 'transparent', transition: 'text-decoration-color 0.2s' }} onMouseOver={e => e.currentTarget.style.textDecorationColor = '#2563eb'} onMouseOut={e => e.currentTarget.style.textDecorationColor = 'transparent'}>{patientName}</span>
                                                        <span className="rec-patient-mrn-badge">MRN: {patientMRN}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="rec-contact-cell">
                                                    <FiPhone className="rec-contact-icon" />
                                                    <a href={`tel:${patientPhone}`} className="rec-phone-link">{patientPhone}</a>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="rec-doctor-cell">
                                                    <div className="rec-doctor-avatar">
                                                        {doctorName.replace(/^Dr\.\s*/i, '').charAt(0).toUpperCase() || 'D'}
                                                    </div>
                                                    <div className="rec-doctor-info-col">
                                                        <span className="rec-doctor-name">{doctorName}</span>
                                                        <span className="rec-doctor-dept-badge">{doctorDept}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="rec-time-pill">{apptTime}</span>
                                            </td>
                                            <td>
                                                <span className="rec-date-cell">{apptDateFormatted}</span>
                                            </td>
                                            <td>
                                                <span className={`rec-status-badge rec-status-${statusStr}`}>
                                                    <span className="rec-status-dot" />
                                                    {statusStr.charAt(0).toUpperCase() + statusStr.slice(1)}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {/* Dedicated Profile Button */}
                                                <div className="rec-table-actions-cell">
                                                    <button 
                                                        className="rec-btn-profile-pill"
                                                        title="View Full Patient Profile & Consent"
                                                        onClick={() => {
                                                            const pid = (typeof appt.userId === 'object' ? (appt.userId?._id || appt.userId?.patientId) : appt.userId) || appt.patientId || appt._id;
                                                            if (pid) {
                                                                navigate(`/patient/${pid}/department/${encodeURIComponent(appt.department || appt.serviceName || 'Unassigned')}`);
                                                            } else {
                                                                setProfileModal({ open: true, patient: appt.userId || appt });
                                                            }
                                                        }}
                                                    >
                                                        <FiEye style={{ fontSize: '13px' }} />
                                                        <span>Profile</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>

                    {/* Infinite Scroll Trigger & Lazy Load footer */}
                    {filteredAppointments.length > visibleCount && (
                        <div ref={loadMoreRef} className="rec-lazy-load-footer">
                            <div className="rec-infinite-loading-pulse">
                                <span className="rec-spinner-dot" />
                                <span className="rec-spinner-dot" />
                                <span className="rec-spinner-dot" />
                            </div>
                            <span className="rec-lazy-counter-text">
                                Showing {visibleAppointments.length} of {filteredAppointments.length} appointments
                            </span>
                            <button 
                                className="rec-load-more-btn"
                                onClick={() => setVisibleCount(prev => prev + PAGE_CHUNK_SIZE)}
                            >
                                <span>Load More</span>
                                <FiChevronDown />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* UPLOAD REPORT MODAL */}
            {uploadModal.open && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '450px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <h3 style={{ margin: '0 0 16px', color: '#1e293b', fontSize: '1.2rem', fontWeight: 800 }}>Upload Patient Report</h3>
                        <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.9rem' }}>
                            Patient: <strong>{uploadModal.patientName}</strong>
                        </p>
                        <form onSubmit={handleReportSubmit}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                                    Select Document (PDF / Image)
                                </label>
                                <input 
                                    type="file" 
                                    accept="application/pdf,image/*" 
                                    onChange={(e) => setSelectedReportFile(e.target.files[0])}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button 
                                    type="button" 
                                    onClick={() => {
                                        setSelectedReportFile(null);
                                        setUploadModal({ open: false, apptId: null, patientName: '', patientId: null });
                                    }}
                                    style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={uploadingReport}
                                    style={{ padding: '8px 20px', background: '#db2777', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, opacity: uploadingReport ? 0.7 : 1 }}
                                >
                                    {uploadingReport ? 'Uploading...' : 'Upload'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PROFILE MODAL */}
            {profileModal.open && profileModal.patient && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999
                }}>
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '500px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eff6ff', paddingBottom: '12px' }}>
                            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem', fontWeight: 800 }}>Patient Profile Details</h3>
                            <button 
                                onClick={() => setProfileModal({ open: false, patient: null })}
                                style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                ✖
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <strong style={{ color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Full Name</strong>
                                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{profileModal.patient.name}</div>
                            </div>
                            <div>
                                <strong style={{ color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>MRN / Patient ID</strong>
                                <div style={{ fontSize: '1rem', fontWeight: 600, color: '#2563eb', marginTop: '2px' }}>{profileModal.patient.patientId || 'N/A'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '20px' }}>
                                <div style={{ flex: 1 }}>
                                    <strong style={{ color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Mobile Number</strong>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{profileModal.patient.phone}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <strong style={{ color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Email Address</strong>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{profileModal.patient.email || '-'}</div>
                                </div>
                            </div>
                            <div>
                                <strong style={{ color: '#475569', fontSize: '0.8rem', textTransform: 'uppercase' }}>Address</strong>
                                <div style={{ fontSize: '0.95rem', color: '#334155', marginTop: '2px' }}>
                                    {[
                                        profileModal.patient.houseNo,
                                        profileModal.patient.street,
                                        profileModal.patient.city,
                                        profileModal.patient.state,
                                        profileModal.patient.zipCode
                                    ].filter(Boolean).join(', ') || 'No address specified'}
                                </div>
                            </div>
                            {profileModal.patient.fertilityProfile && (
                                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                                    <h4 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>KYC & Demographics</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '0.85rem' }}>
                                        <div>Age: <strong>{profileModal.patient.fertilityProfile.age || '-'}</strong></div>
                                        <div>Gender: <strong>{profileModal.patient.fertilityProfile.gender || '-'}</strong></div>
                                        <div>Relative: <strong>{profileModal.patient.fertilityProfile.partnerFirstName || '-'} ({profileModal.patient.fertilityProfile.relationToPatient || 'Relative'})</strong></div>
                                        <div>Source: <strong>{profileModal.patient.fertilityProfile.referralType || '-'}</strong></div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                            <button 
                                onClick={() => setProfileModal({ open: false, patient: null })}
                                style={{ padding: '8px 24px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReceptionPatients;
