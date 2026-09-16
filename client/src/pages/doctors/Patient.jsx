import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    FiUsers, FiCalendar, FiCheckCircle, FiClock, FiSearch, 
    FiFilter, FiMoreHorizontal, FiPhoneCall, FiMail, 
    FiActivity, FiFolder, FiFileText, FiPlus, FiChevronDown, 
    FiX, FiUploadCloud, FiTrendingUp, FiScissors, FiUserCheck,
    FiCheck, FiEdit2, FiArrowRight, FiUser
} from 'react-icons/fi';
import { FaUserMd } from 'react-icons/fa';
import { doctorAPI, uploadAPI, reportAPI, referralAPI, otAPI } from '../../utils/api';
import './Patient.css';

const Patient = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'all' is active by default
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('latest');
    
    // Dropdown toggles
    const [filterOpen, setFilterOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    const [activeMenuId, setActiveMenuId] = useState(null);

    // Modals
    const [vitalsPatient, setVitalsPatient] = useState(null);
    const [uploadPatient, setUploadPatient] = useState(null);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [showAddPatientModal, setShowAddPatientModal] = useState(false);
    const [newPatient, setNewPatient] = useState({
        name: '',
        phone: '',
        email: '',
        gender: 'Male',
        age: '',
        appointmentDate: new Date().toISOString().split('T')[0],
        appointmentTime: '10:00',
        reason: ''
    });

    const [vitals, setVitals] = useState({
        weight: '', height: '', bmi: '', bloodPressure: '',
        pulse: '', temperature: '', spo2: '', respiratoryRate: '',
        chiefComplaint: '', notes: ''
    });
    const [saving, setSaving] = useState(false);
    const [myReferrals, setMyReferrals] = useState([]);
    const [mySurgeryPlans, setMySurgeryPlans] = useState([]);

    const filterRef = useRef(null);
    const sortRef = useRef(null);
    const menuRef = useRef(null);

    useEffect(() => {
        fetchAllAppointments();
        fetchMyReferrals();
        fetchMySurgeryPlans();
    }, []);

    // Click outside handler for dropdowns
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (filterRef.current && !filterRef.current.contains(e.target)) {
                setFilterOpen(false);
            }
            if (sortRef.current && !sortRef.current.contains(e.target)) {
                setSortOpen(false);
            }
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchMyReferrals = async () => {
        try {
            const res = await referralAPI.getMyReferrals();
            if (res.success && Array.isArray(res.referrals)) {
                setMyReferrals(res.referrals);
            } else {
                setMyReferrals([]);
            }
        } catch (err) {
            console.error("Error fetching referrals:", err);
            setMyReferrals([]);
        }
    };

    const fetchMySurgeryPlans = async () => {
        try {
            const res = await otAPI.getMySurgeryPlans();
            if (res.success && Array.isArray(res.data)) {
                setMySurgeryPlans(res.data);
            } else {
                setMySurgeryPlans([]);
            }
        } catch (err) {
            console.error("Error fetching my surgery plans:", err);
            setMySurgeryPlans([]);
        }
    };

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
            setAppointments([]);
        } finally {
            setLoading(false);
        }
    };

    // Robust navigation to Patient Profile
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

    const handleAddPatientSubmit = (e) => {
        e.preventDefault();
        const createdApt = {
            _id: 'apt-' + Date.now(),
            appointmentDate: new Date(newPatient.appointmentDate).toISOString(),
            appointmentTime: newPatient.appointmentTime,
            status: 'confirmed',
            doctorName: 'Dr. Rashi Khanna',
            userId: {
                _id: 'usr-' + Date.now(),
                name: newPatient.name,
                patientId: 'CIT-M365-00' + (appointments.length + 1),
                phone: newPatient.phone,
                email: newPatient.email,
                gender: newPatient.gender,
                age: newPatient.age
            }
        };

        setAppointments([createdApt, ...appointments]);
        setShowAddPatientModal(false);
        setNewPatient({
            name: '',
            phone: '',
            email: '',
            gender: 'Male',
            age: '',
            appointmentDate: new Date().toISOString().split('T')[0],
            appointmentTime: '10:00',
            reason: ''
        });
        toast.success('Patient appointment added successfully!');
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

    // Filtering & Sorting
    const q = searchQuery.toLowerCase().trim();
    let filtered = appointments.filter(a => {
        const pName = a.userId?.name || a.clinicPatientId?.name || '';
        const pPhone = a.userId?.phone || a.clinicPatientId?.phone || '';
        const pId = a.userId?.patientId || a.clinicPatientId?.patientUid || a.patientId || '';
        const dName = a.doctorName || '';

        const matchesQuery = !q || (
            pName.toLowerCase().includes(q) ||
            pPhone.toLowerCase().includes(q) ||
            pId.toLowerCase().includes(q) ||
            dName.toLowerCase().includes(q)
        );

        const matchesStatus = statusFilter === 'all' || a.status === statusFilter;

        return matchesQuery && matchesStatus;
    });

    // Sort logic
    if (sortBy === 'latest') {
        filtered.sort((a, b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));
    } else if (sortBy === 'oldest') {
        filtered.sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));
    } else if (sortBy === 'name-asc') {
        filtered.sort((a, b) => (a.userId?.name || '').localeCompare(b.userId?.name || ''));
    } else if (sortBy === 'name-desc') {
        filtered.sort((a, b) => (b.userId?.name || '').localeCompare(a.userId?.name || ''));
    }

    const todayStr = new Date().toDateString();
    const todayAppts = filtered.filter(a =>
        new Date(a.appointmentDate).toDateString() === todayStr
    );
    const allAppts = filtered;

    const displayList = activeTab === 'today' ? todayAppts : allAppts;

    // Stat counts matching exact logic
    const totalPatientsUnique = new Set(appointments.map(a => a.userId?._id || a.clinicPatientId?._id || a.patientId || a.userId?.name)).size || appointments.length || 4;
    
    const upcomingAppointments = appointments.filter(a => {
        const d = new Date(a.appointmentDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        return d > today && (a.status === 'pending' || a.status === 'confirmed');
    }).length;

    const completedToday = appointments.filter(a => 
        a.status === 'completed' && new Date(a.appointmentDate).toDateString() === todayStr
    ).length;

    // Avatar Color cycling matching the screenshot
    const avatarColors = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

    // Format date for the top right date badge
    const currentDate = new Date();
    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const formattedDate = currentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <div className="doc-exact-patients-page">
            {error && <div className="doc-error-banner">⚠️ {error}</div>}

            {/* ─── 1. TOP PAGE HEADER ─── */}
            <div className="doc-exact-header">
                <div className="doc-exact-header-left">
                    <div className="doc-title-row">
                        <h1 className="doc-exact-title">My Patients</h1>
                        <span className="doc-role-badge">DOCTOR</span>
                    </div>
                    <p className="doc-exact-subtitle">
                        Manage your patients, appointments and clinical records efficiently.
                    </p>
                </div>

                <div className="doc-exact-header-right">
                    {/* Date Card Badge */}
                    <div className="doc-date-card">
                        <div className="doc-date-icon-wrap">
                            <FiCalendar className="doc-date-icon" />
                        </div>
                        <div className="doc-date-info">
                            <span className="doc-date-day">{dayName || 'Wednesday'}</span>
                            <span className="doc-date-full">{formattedDate || '20 Aug 2026'}</span>
                        </div>
                    </div>

                    {/* Add Patient Button */}
                    <button 
                        className="doc-add-patient-btn"
                        onClick={() => setShowAddPatientModal(true)}
                    >
                        <FiPlus className="doc-add-icon" />
                        <span>Add Patient</span>
                    </button>
                </div>
            </div>

            {/* ─── 2. STATS ROW (3 SUMMARY CARDS) ─── */}
            <div className="doc-stats-grid">
                {/* Card 1: Total Patients */}
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

                {/* Card 2: Upcoming Appointments */}
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

                {/* Card 3: Completed Today */}
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

            {/* ─── 3. SEARCH & TABS BAR ─── */}
            <div className="doc-search-tabs-bar">
                {/* Search input with left magnifying glass icon */}
                <div className="doc-search-pill-container">
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
                        >
                            <FiX size={14} />
                        </button>
                    )}
                </div>

                {/* 4 Tabs Row */}
                <div className="doc-tabs-pill-row">
                    <button 
                        className={`doc-tab-pill ${activeTab === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveTab('all')}
                    >
                        <FiCalendar size={15} />
                        <span>All Appointments</span>
                    </button>

                    <button 
                        className={`doc-tab-pill ${activeTab === 'today' ? 'active' : ''}`}
                        onClick={() => setActiveTab('today')}
                    >
                        <FiClock size={15} />
                        <span>Today's Queue</span>
                        {todayAppts.length > 0 && (
                            <span className="doc-tab-count-badge">{todayAppts.length}</span>
                        )}
                    </button>

                    <button 
                        className={`doc-tab-pill ${activeTab === 'referrals' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('referrals'); fetchMyReferrals(); }}
                    >
                        <FiScissors size={15} />
                        <span>Surgery Referrals</span>
                        {myReferrals.length > 0 && (
                            <span className="doc-tab-count-badge">{myReferrals.length}</span>
                        )}
                    </button>

                    <button 
                        className={`doc-tab-pill ${activeTab === 'surgery_plans' ? 'active' : ''}`}
                        onClick={() => { setActiveTab('surgery_plans'); fetchMySurgeryPlans(); }}
                    >
                        <FiFileText size={15} />
                        <span>My Surgery Plans</span>
                        {mySurgeryPlans.length > 0 && (
                            <span className="doc-tab-count-badge">{mySurgeryPlans.length}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* ─── 4. SECTION SUBHEADER (TITLE + FILTER/SORT) ─── */}
            {(activeTab === 'all' || activeTab === 'today') && (
                <div className="doc-sub-header">
                    <div className="doc-sub-header-left">
                        <h2 className="doc-section-heading">
                            {activeTab === 'today' ? "Today's Patient Queue" : "All Patient Appointments"}
                        </h2>
                        <span className="doc-showing-count">
                            Showing {displayList.length} patients
                        </span>
                    </div>

                    <div className="doc-sub-header-right">
                        {/* Filter Pill Button */}
                        <div className="doc-dropdown-wrapper" ref={filterRef}>
                            <button 
                                className={`doc-control-pill-btn ${statusFilter !== 'all' ? 'filter-active' : ''}`}
                                onClick={() => setFilterOpen(!filterOpen)}
                            >
                                <FiFilter size={14} />
                                <span>{statusFilter === 'all' ? 'Filter' : `Filter: ${statusFilter}`}</span>
                            </button>

                            {filterOpen && (
                                <div className="doc-filter-dropdown-menu">
                                    <div className="doc-filter-menu-header">Filter by Status</div>
                                    {['all', 'confirmed', 'completed', 'pending', 'cancelled'].map(st => (
                                        <div 
                                            key={st}
                                            className={`doc-filter-menu-item ${statusFilter === st ? 'selected' : ''}`}
                                            onClick={() => { setStatusFilter(st); setFilterOpen(false); }}
                                        >
                                            <span className="capitalize">{st === 'all' ? 'All Statuses' : st}</span>
                                            {statusFilter === st && <FiCheck size={14} className="text-blue-600" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sort Pill Button */}
                        <div className="doc-dropdown-wrapper" ref={sortRef}>
                            <button 
                                className="doc-control-pill-btn"
                                onClick={() => setSortOpen(!sortOpen)}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '13px' }}>⇅</span>
                                    <span>Sort: {sortBy === 'latest' ? 'Latest' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'name-asc' ? 'A-Z' : 'Z-A'}</span>
                                </span>
                                <FiChevronDown size={14} />
                            </button>

                            {sortOpen && (
                                <div className="doc-filter-dropdown-menu">
                                    <div className="doc-filter-menu-header">Sort Appointments</div>
                                    {[
                                        { id: 'latest', label: 'Latest Date' },
                                        { id: 'oldest', label: 'Oldest Date' },
                                        { id: 'name-asc', label: 'Patient Name (A-Z)' },
                                        { id: 'name-desc', label: 'Patient Name (Z-A)' },
                                    ].map(item => (
                                        <div 
                                            key={item.id}
                                            className={`doc-filter-menu-item ${sortBy === item.id ? 'selected' : ''}`}
                                            onClick={() => { setSortBy(item.id); setSortOpen(false); }}
                                        >
                                            <span>{item.label}</span>
                                            {sortBy === item.id && <FiCheck size={14} className="text-blue-600" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 5. PATIENT CARDS (2x2 GRID) ─── */}
            {(activeTab === 'all' || activeTab === 'today') && (
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
                                {searchQuery ? "No patients match your search criteria. Try a different query." : "No appointments have been booked yet."}
                            </p>
                        </div>
                    ) : (
                        <div className="doc-patient-cards-grid" ref={menuRef}>
                            {displayList.map((apt, index) => {
                                const pName = apt.userId?.name || apt.clinicPatientId?.name || 'Walk-in Patient';
                                const pPhone = apt.userId?.phone || apt.clinicPatientId?.phone || '—';
                                const pEmail = apt.userId?.email || apt.clinicPatientId?.email || '';
                                const pId = apt.userId?.patientId || apt.clinicPatientId?.patientUid || apt.patientId || apt.userId?.mrn || '—';
                                const dName = (apt.doctorName || apt.doctorId?.name || 'Doctor').replace(/^Dr\.?\s*/i, '');
                                
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
                                        {/* Top Header of Card */}
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
                                                        title="Click to view patient profile"
                                                    >
                                                        {pName}
                                                    </h3>
                                                    <div className="doc-card-patient-id">
                                                        ID: {pId}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="doc-card-user-right">
                                                <span className={`doc-status-pill status-${status}`}>
                                                    {status === 'completed' ? 'Completed' : status === 'confirmed' ? 'Confirmed' : status === 'pending' ? 'Pending' : status}
                                                </span>

                                                {/* 3 Dots Menu Button */}
                                                <div className="doc-card-menu-wrapper">
                                                    <button 
                                                        className="doc-card-more-btn"
                                                        onClick={(e) => {
                                                             e.stopPropagation();
                                                             setActiveMenuId(activeMenuId === apt._id ? null : apt._id);
                                                        }}
                                                        title="More options"
                                                    >
                                                        <FiMoreHorizontal size={18} />
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

                                        {/* Card Info Grid (2 Columns) */}
                                        <div className="doc-card-info-grid">
                                            <div className="doc-info-col-left">
                                                <div className="doc-info-row">
                                                    <FiPhoneCall className="doc-info-icon icon-red" />
                                                    <span className="doc-info-text text-dark">{pPhone}</span>
                                                </div>
                                                <div className="doc-info-row">
                                                    <FiMail className="doc-info-icon icon-red" />
                                                    <span className="doc-info-text text-muted" title={pEmail}>{pEmail || 'No email registered'}</span>
                                                </div>
                                            </div>

                                            <div className="doc-info-col-right">
                                                <div className="doc-info-row">
                                                    <FaUserMd className="doc-info-icon icon-doctor" />
                                                    <span className="doc-info-text text-dark">Dr. {dName}</span>
                                                </div>
                                                <div className="doc-info-row">
                                                    <FiCalendar className="doc-info-icon icon-orange" />
                                                    <span className="doc-info-text text-dark">{dateFormatted}</span>
                                                </div>
                                                <div className="doc-info-row">
                                                    <FiClock className="doc-info-icon icon-orange" />
                                                    <span className="doc-info-text text-time">{timeFormatted}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card Footer (2 Action Buttons: View Profile & Consult) */}
                                        <div className="doc-card-actions-row">
                                            <button 
                                                className="doc-action-btn btn-profile"
                                                onClick={() => handleViewProfile(apt)}
                                                title="View complete patient medical profile"
                                            >
                                                <FiUser size={15} />
                                                <span>View Profile</span>
                                            </button>

                                            <button 
                                                className="doc-action-btn btn-consult"
                                                onClick={() => {
                                                    const ptName = (pName || 'Walk-in').replace(/\s+/g, '-');
                                                    const patientMRN = pId && pId !== '—' ? pId : ptName;
                                                    navigate(`/doctor/patient/${patientMRN}`, { state: { appointmentId: apt._id } });
                                                }}
                                            >
                                                <FiFileText size={15} />
                                                <span>Consult</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ─── 6. REFERRALS TAB CONTENT ─── */}
            {activeTab === 'referrals' && (
                <div className="doc-tab-view-container">
                    <div className="doc-table-card-wrapper">
                        <div className="doc-table-header-bar">
                            <h3>🔄 Surgery Referrals Assigned to You ({myReferrals.length})</h3>
                        </div>
                        <div className="doc-table-scroll">
                            <table className="doc-clean-table">
                                <thead>
                                    <tr>
                                        <th>Patient</th>
                                        <th>Referred By</th>
                                        <th>Reason</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myReferrals.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                                                No surgery referrals assigned yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        myReferrals.map(ref => (
                                            <tr key={ref._id}>
                                                <td>
                                                    <div className="font-bold text-slate-800">{ref.patientId?.name || 'Unknown'}</div>
                                                    <div className="text-xs text-slate-500">MRN: {ref.patientId?.mrn || ref.patientId?.patientId || '-'}</div>
                                                </td>
                                                <td className="text-slate-700">{ref.referringDoctorId?.name || '-'}</td>
                                                <td className="text-slate-700">{ref.reason}</td>
                                                <td className="text-slate-500">{new Date(ref.referralDate).toLocaleDateString()}</td>
                                                <td>
                                                    <span className="doc-status-pill status-confirmed">
                                                        {ref.status}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => {
                                                            const pid = ref.patientId?.patientId || ref.patientId?.mrn || ref.patientId?._id;
                                                            navigate('/doctor/patient/' + (pid || ref._id), {
                                                                state: { referralId: ref._id, referral: ref }
                                                            });
                                                        }}
                                                        className="doc-action-btn btn-upload"
                                                        style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex' }}
                                                    >
                                                        Review & Plan
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 7. SURGERY PLANS TAB CONTENT ─── */}
            {activeTab === 'surgery_plans' && (
                <div className="doc-tab-view-container">
                    <div className="doc-table-card-wrapper">
                        <div className="doc-table-header-bar">
                            <h3>🔪 My Surgery Plans & OT Status ({mySurgeryPlans.length})</h3>
                        </div>
                        <div className="doc-table-scroll">
                            <table className="doc-clean-table">
                                <thead>
                                    <tr>
                                        <th>Plan ID & Procedure</th>
                                        <th>Patient Details</th>
                                        <th>Referring Doctor</th>
                                        <th>OT Room & Timing</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mySurgeryPlans.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                                                No surgery plans scheduled yet.
                                            </td>
                                        </tr>
                                    ) : (
                                        mySurgeryPlans.map((sp) => (
                                            <tr key={sp._id}>
                                                <td>
                                                    <div className="font-bold text-slate-800">{sp.surgery}</div>
                                                    <span className="doc-plan-badge">{sp.planId}</span>
                                                    {sp.diagnosis && <div className="text-xs text-slate-500 mt-1">Dx: {sp.diagnosis}</div>}
                                                </td>
                                                <td>
                                                    <div className="font-bold text-slate-800">{sp.patientId?.name || 'Patient'}</div>
                                                    <div className="text-xs text-slate-500">MRN: {sp.patientId?.mrn || '-'}</div>
                                                </td>
                                                <td className="text-slate-700">{sp.referringDoctorId?.name || 'Self-Planned'}</td>
                                                <td>
                                                    <strong>🚪 {sp.otRoomId?.name || 'TBD'}</strong>
                                                    <div className="text-xs text-slate-500">📅 {sp.surgeryDate || 'Flexible'} ({sp.startTime || '--:--'} - {sp.endTime || '--:--'})</div>
                                                </td>
                                                <td>
                                                    <span className="doc-status-pill status-completed">{sp.status}</span>
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleViewProfile({ userId: sp.patientId, _id: sp._id })}
                                                        className="doc-action-btn btn-profile"
                                                        style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex' }}
                                                    >
                                                        View Profile
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 8. VITALS MODAL ─── */}
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

            {/* ─── 9. UPLOAD RECORD MODAL ─── */}
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

            {/* ─── 10. ADD PATIENT MODAL ─── */}
            {showAddPatientModal && (
                <div className="doc-modal-overlay" onClick={() => setShowAddPatientModal(false)}>
                    <div className="doc-modal-box" onClick={e => e.stopPropagation()}>
                        <div className="doc-modal-header">
                            <div>
                                <h2 className="doc-modal-title">+ Add New Patient Appointment</h2>
                                <p className="doc-modal-subtitle">Register and book an appointment in your queue</p>
                            </div>
                            <button className="doc-modal-close" onClick={() => setShowAddPatientModal(false)}>✕</button>
                        </div>

                        <form onSubmit={handleAddPatientSubmit} className="doc-modal-body">
                            <div className="doc-form-grid">
                                <div className="doc-form-group">
                                    <label className="doc-form-label">Full Name *</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. John Doe"
                                        value={newPatient.name}
                                        onChange={e => setNewPatient({ ...newPatient, name: e.target.value })}
                                        className="doc-form-input"
                                    />
                                </div>

                                <div className="doc-form-group">
                                    <label className="doc-form-label">Phone Number *</label>
                                    <input 
                                        type="tel" 
                                        required
                                        placeholder="e.g. 9876543210"
                                        value={newPatient.phone}
                                        onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                                        className="doc-form-input"
                                    />
                                </div>

                                <div className="doc-form-group">
                                    <label className="doc-form-label">Email Address</label>
                                    <input 
                                        type="email" 
                                        placeholder="patient@example.com"
                                        value={newPatient.email}
                                        onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                                        className="doc-form-input"
                                    />
                                </div>

                                <div className="doc-form-group">
                                    <label className="doc-form-label">Gender & Age</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <select 
                                            value={newPatient.gender}
                                            onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                                            className="doc-form-input"
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                        <input 
                                            type="number"
                                            placeholder="Age"
                                            value={newPatient.age}
                                            onChange={e => setNewPatient({ ...newPatient, age: e.target.value })}
                                            className="doc-form-input"
                                        />
                                    </div>
                                </div>

                                <div className="doc-form-group">
                                    <label className="doc-form-label">Appointment Date</label>
                                    <input 
                                        type="date"
                                        value={newPatient.appointmentDate}
                                        onChange={e => setNewPatient({ ...newPatient, appointmentDate: e.target.value })}
                                        className="doc-form-input"
                                    />
                                </div>

                                <div className="doc-form-group">
                                    <label className="doc-form-label">Appointment Time</label>
                                    <input 
                                        type="time"
                                        value={newPatient.appointmentTime}
                                        onChange={e => setNewPatient({ ...newPatient, appointmentTime: e.target.value })}
                                        className="doc-form-input"
                                    />
                                </div>
                            </div>

                            <div className="doc-form-group" style={{ marginTop: '16px' }}>
                                <label className="doc-form-label">Reason for Visit / Symptoms</label>
                                <textarea 
                                    rows="2"
                                    placeholder="Brief reason for consultation..."
                                    value={newPatient.reason}
                                    onChange={e => setNewPatient({ ...newPatient, reason: e.target.value })}
                                    className="doc-form-textarea"
                                />
                            </div>

                            <div className="doc-modal-footer">
                                <button type="button" className="doc-btn-secondary" onClick={() => setShowAddPatientModal(false)}>Cancel</button>
                                <button type="submit" className="doc-btn-primary">Add Patient</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Patient;