import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { receptionAPI, publicAPI } from '../utils/api';
import './RoleDashboard.css';
import './hospitaladmin/HospitalAdminDashboard.css';
import { FiSearch, FiCalendar, FiUsers, FiActivity, FiTrash2, FiEdit2, FiLayers } from 'react-icons/fi';

// Icon mapping — maps common path keywords to emojis
const getIconForPath = (path, label) => {
    const text = `${path} ${label}`.toLowerCase();
    if (text.includes('patient')) return '🩺';
    if (text.includes('doctor')) return '👨‍⚕️';
    if (text.includes('appointment')) return '📅';
    if (text.includes('lab') || text.includes('test')) return '🧪';
    if (text.includes('pharmacy') || text.includes('medicine') || text.includes('inventory')) return '💊';
    if (text.includes('order')) return '📦';
    if (text.includes('reception') || text.includes('front')) return '🏥';
    if (text.includes('report')) return '📊';
    if (text.includes('dashboard') || text.includes('home')) return '🏠';
    if (text.includes('admin') || text.includes('manage')) return '⚙️';
    if (text.includes('role') || text.includes('permission')) return '🔑';
    return '📋';
};

const getDescForLink = (label) => {
    const text = label.toLowerCase();
    if (text.includes('registration')) return 'Register and manage patient records';
    if (text.includes('search')) return 'Lookup patient files and history';
    if (text.includes('billing')) return 'View bills and process payments';
    if (text.includes('patients')) return 'Access your patient queue and clinical workspace';
    return 'Access the modules of your workspace';
};

const operationLinks = [
    { icon: '👨‍⚕️', label: 'Doctors', desc: 'Manage doctor profiles & schedules', path: '/admin/doctors', bg: '#dbeafe', color: '#2563eb' },
    { icon: '🧪', label: 'Labs', desc: 'Configure lab departments', path: '/admin/lab-tests', bg: '#f3e8ff', color: '#9333ea' },
    { icon: '💊', label: 'Pharmacy', desc: 'Pharmacy inventory & orders', path: '/pharmacy/inventory', bg: '#ffedd5', color: '#ea580c' },
    { icon: '🛠️', label: 'Services', desc: 'Hospital services & pricing', path: '/admin/services', bg: '#fefce8', color: '#ca8a04' },
    { icon: '👥', label: 'Manage Users', desc: 'View and manage all staff', path: '/admin/users', bg: '#f0f9ff', color: '#0284c7' },
    { icon: '📝', label: 'Question Library', desc: 'Manage diagnostic questions', path: '/hospitaladmin/question-library', bg: '#fdf2f8', color: '#be185d' },
];

const RoleDashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    const userName = user.name || 'Staff';
    const roleName = user.role || 'Staff';
    const isReception = (user.role || '').toLowerCase() === 'reception' || (user.role || '').toLowerCase() === 'receptionist';
    const todayStr = new Date().toISOString().split('T')[0];
    const permissions = user.permissions || [];

    // Receptionist Dashboard state
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [loadingAppts, setLoadingAppts] = useState(false);

    // Search and tab states
    const [searchText, setSearchText] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'today' or 'all'

    // Modals state
    const [vitalsModal, setVitalsModal] = useState({ open: false, patient: null });
    const [vitalsForm, setVitalsForm] = useState({ height: '', weight: '', bloodGroup: '', bp: '', temp: '', spo2: '', pulse: '' });
    const [savingVitals, setSavingVitals] = useState(false);

    const [uploadModal, setUploadModal] = useState({ open: false, apptId: null, patientName: '' });
    const [selectedReportFile, setSelectedReportFile] = useState(null);

    const [consultModal, setConsultModal] = useState({ open: false, patient: null, sessions: [] });

    const processFormChange = useCallback((e, formSetter) => {
        const { name, value } = e.target;
        if (name === 'phone') {
            const cleanVal = value.replace(/\D/g, '').slice(0, 10);
            formSetter(prev => ({ ...prev, [name]: cleanVal }));
        } else if (name === 'aadhaarNumber') {
            const cleanVal = value.replace(/\D/g, '').slice(0, 12);
            formSetter(prev => ({ ...prev, [name]: cleanVal }));
        } else {
            formSetter(prev => ({ ...prev, [name]: value }));
        }
    }, []);

    const handleVitalsFormChange = useCallback(
        (e) => processFormChange(e, setVitalsForm), 
        [processFormChange]
    );


    useEffect(() => {
        if (isReception) {
            navigate('/reception/dashboard', { replace: true });
        } else if ((roleName || '').toLowerCase() === 'centraladmin' || (roleName || '').toLowerCase() === 'superadmin') {
            navigate('/supremeadmin', { replace: true });
        }
    }, [isReception, roleName, navigate]);

    const fetchRecentPatients = async () => {
        setLoadingPatients(true);
        try {
            const res = await receptionAPI.getAllPatients();
            if (res.success) {
                setPatients(res.patients || []);
            }
        } catch (error) {
            console.error("Error fetching patients:", error);
        } finally {
            setLoadingPatients(false);
        }
    };

    const fetchAppointments = async () => {
        setLoadingAppts(true);
        try {
            const res = await receptionAPI.getAllAppointments({ all: 'true' });
            if (res.success) {
                setAppointments(res.appointments || []);
            }
        } catch (error) {
            console.error("Error fetching appointments:", error);
        } finally {
            setLoadingAppts(false);
        }
    };

    const handleCancelAppointment = async (apptId) => {
        if (!window.confirm("Are you sure you want to cancel this appointment?")) return;
        try {
            const res = await receptionAPI.cancelAppointment(apptId);
            if (res.success) {
                alert("Appointment cancelled successfully!");
                fetchAppointments();
            } else {
                alert("Failed to cancel appointment: " + res.message);
            }
        } catch (error) {
            console.error("Cancel appt error:", error);
        }
    };

    const handleEditPatient = (patient) => {
        navigate('/reception/dashboard', { state: { patient } });
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short'
        });
    };

    const getAvatarColor = (name) => {
        const charCode = (name || 'P').charCodeAt(0);
        const colors = [
            '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', 
            '#10b981', '#06b6d4', '#6366f1', '#14b8a6'
        ];
        return colors[charCode % colors.length];
    };

    // Vitals Submit
    const handleVitalsSubmit = async (e) => {
        e.preventDefault();
        if (!vitalsModal.patient) return;
        setSavingVitals(true);
        try {
            const userId = vitalsModal.patient._id;
            const res = await receptionAPI.updateIntake(userId, {
                height: vitalsForm.height,
                weight: vitalsForm.weight,
                bloodGroup: vitalsForm.bloodGroup,
                historyPulse: vitalsForm.pulse,
                historyBp: vitalsForm.bp
            });
            if (res.success) {
                alert(`Vitals updated successfully for ${vitalsModal.patient.name}!`);
                setVitalsModal({ open: false, patient: null });
                fetchRecentPatients();
            } else {
                alert("Failed to save vitals: " + res.message);
            }
        } catch (err) {
            console.error("Error saving vitals:", err);
            alert("Error saving vitals: " + err.message);
        } finally {
            setSavingVitals(false);
        }
    };

    // Report Submit
    const handleReportSubmit = (e) => {
        e.preventDefault();
        if (!selectedReportFile) {
            alert('Please select a file to upload!');
            return;
        }
        alert(`Report file "${selectedReportFile.name}" uploaded successfully for ${uploadModal.patientName}!`);
        setSelectedReportFile(null);
        setUploadModal({ open: false, apptId: null, patientName: '' });
    };

    // Open Past Consultations modal
    const handleOpenConsultSessions = (patientUser) => {
        const patientSessions = appointments.filter(a => 
            a.userId?._id === patientUser._id && 
            a.status === 'completed'
        );
        setConsultModal({
            open: true,
            patient: patientUser,
            sessions: patientSessions
        });
    };

    // Get time-based greeting
    const hour = new Date().getHours();
    let greeting = 'Good morning';
    if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
    else if (hour >= 17) greeting = 'Good evening';

    // Metrics calculations
    const totalPatientsCount = patients.length;
    const upcomingApptsCount = appointments.filter(a => {
        const isFuture = a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] >= todayStr;
        return isFuture && ['pending', 'confirmed'].includes(a.status);
    }).length;
    const completedTodayCount = appointments.filter(a => {
        const isToday = a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] === todayStr;
        return isToday && a.status === 'completed';
    }).length;

    // Override nav links for receptionist
    let navLinks = user.navLinks || [];
    const isDoctor = (user.role || '').toLowerCase() === 'doctor' || (user.role || '').toLowerCase() === 'clinic doctor';
    if (isReception) {
        navLinks = [
            { label: 'Patient Registration', path: '/reception/dashboard' },
            { label: 'Patient Search', path: '/reception/patients' },
            { label: 'Patient Billing', path: '/billing/patient' }
        ];
    } else if (isDoctor) {
        navLinks = navLinks.map(link => 
            (link.path === '/hospitaladmin' || link.path === '/doctor/dashboard') ? { ...link, path: '/doctor/dashboard', label: 'Patients' } : link
        );
    }

    if (isReception) {
        return (
            <div style={{ padding: '60px', textAlign: 'center', fontSize: '1.2rem', color: '#64748b', fontWeight: '600' }}>
                Redirecting to Welcome Dashboard...
            </div>
        );
    }

    return (
        <div className="role-dashboard">
            <div className="dashboard-container">
                {isReception ? (
                    /* ────────────────────────────────────────────────────────
                       RECEPTIONIST PATIENT LIST VIEW (CLINIC DASHBOARD STYLE)
                       ──────────────────────────────────────────────────────── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        
                        {/* STATS CARDS ROW */}
                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            {/* Card 1: Total Patients */}
                            <div style={{
                                flex: '1 1 280px',
                                background: '#ffffff',
                                borderRadius: '12px',
                                padding: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.02)',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem'
                                }}>
                                    <FiUsers />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', lineHeight: '1.2' }}>
                                        {totalPatientsCount}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        TOTAL PATIENTS (UNIQUE)
                                    </span>
                                </div>
                            </div>

                            {/* Card 2: Upcoming Appointments */}
                            <div style={{
                                flex: '1 1 280px',
                                background: '#ffffff',
                                borderRadius: '12px',
                                padding: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.02)',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: '#fff7ed',
                                    color: '#ea580c',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem'
                                }}>
                                    <FiCalendar />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', lineHeight: '1.2' }}>
                                        {upcomingApptsCount}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        UPCOMING APPOINTMENTS
                                    </span>
                                </div>
                            </div>

                            {/* Card 3: Completed Today */}
                            <div style={{
                                flex: '1 1 280px',
                                background: '#ffffff',
                                borderRadius: '12px',
                                padding: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.02)',
                                border: '1px solid #e2e8f0'
                            }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: '#f0fdf4',
                                    color: '#16a34a',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.5rem'
                                }}>
                                    <FiActivity />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', lineHeight: '1.2' }}>
                                        {completedTodayCount}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        COMPLETED TODAY
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* SEARCH AND TOGGLE ROW */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '10px' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: '#ffffff',
                                border: '1.5px solid #cbd5e1',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                width: '100%',
                                maxWidth: '360px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                                <FiSearch style={{ color: '#94a3b8' }} />
                                <input 
                                    type="text"
                                    placeholder="Search patient name, phone, MRN, or doctor..."
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    style={{ border: 'none', outline: 'none', marginLeft: '8px', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '8px', padding: '3px' }}>
                                <button 
                                    onClick={() => setActiveTab('today')}
                                    style={{
                                        background: activeTab === 'today' ? '#2563eb' : 'transparent',
                                        color: activeTab === 'today' ? '#ffffff' : '#475569',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Today's Queue
                                </button>
                                <button 
                                    onClick={() => setActiveTab('all')}
                                    style={{
                                        background: activeTab === 'all' ? '#2563eb' : 'transparent',
                                        color: activeTab === 'all' ? '#ffffff' : '#475569',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    All Appointments
                                </button>
                            </div>
                        </div>

                        {/* TABLE CARD */}
                        <div style={{ background: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                                <span style={{ fontSize: '1.25rem' }}>📁</span>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                                    {activeTab === 'today' ? "Today's Queue" : "All Appointments"}
                                </h3>
                            </div>

                            {loadingAppts ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Loading appointments...</div>
                            ) : (
                                <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #edf2f7' }}>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>#</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>Patient</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>Contact</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>Doctor (Referred To)</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>Time</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>Date</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                                                <th style={{ padding: '12px 16px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {appointments
                                                .filter(appt => {
                                                    // Filter by tab
                                                    if (activeTab === 'today') {
                                                        const isToday = appt.appointmentDate && new Date(appt.appointmentDate).toISOString().split('T')[0] === todayStr;
                                                        if (!isToday) return false;
                                                    }
                                                    // Filter by search text
                                                    if (searchText.trim().length > 0) {
                                                        const q = searchText.toLowerCase();
                                                        const matchName = String(appt.userId?.name || '').toLowerCase().includes(q);
                                                        const matchPhone = String(appt.userId?.phone || '').includes(q);
                                                        const matchMRN = String(appt.userId?.patientId || '').toLowerCase().includes(q);
                                                        const matchDoc = String(appt.doctorId?.name || '').toLowerCase().includes(q);
                                                        return matchName || matchPhone || matchMRN || matchDoc;
                                                    }
                                                    return true;
                                                })
                                                .map((appt, idx) => (
                                                    <tr key={appt._id} style={{ borderBottom: '1px solid #edf2f7', transition: 'background 0.2s' }}>
                                                        <td style={{ padding: '14px 16px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <div style={{
                                                                    width: '34px',
                                                                    height: '34px',
                                                                    borderRadius: '50%',
                                                                    backgroundColor: getAvatarColor(appt.userId?.name),
                                                                    color: '#ffffff',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: '800',
                                                                    fontSize: '0.9rem'
                                                                }}>
                                                                    {(appt.userId?.name || 'P')[0].toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: 700, color: '#1e293b' }}>{appt.userId?.name || 'Walk-in'}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>MRN: {appt.userId?.patientId || 'N/A'}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 600 }}>{appt.userId?.phone || '-'}</td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <div style={{
                                                                    width: '28px',
                                                                    height: '28px',
                                                                    borderRadius: '50%',
                                                                    backgroundColor: '#10b981',
                                                                    color: '#ffffff',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: '800',
                                                                    fontSize: '0.8rem'
                                                                }}>
                                                                    {(appt.doctorId?.name || 'D')[0].toUpperCase()}
                                                                </div>
                                                                <span style={{ fontWeight: 600, color: '#334155' }}>{appt.doctorId?.name || 'Not Assigned'}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', color: '#1e293b', fontWeight: 700 }}>{appt.appointmentTime}</td>
                                                        <td style={{ padding: '14px 16px', color: '#475569', fontWeight: 600 }}>{formatDate(appt.appointmentDate)}</td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '800',
                                                                textTransform: 'capitalize',
                                                                background: appt.status === 'confirmed' ? '#dcfce7' : appt.status === 'completed' ? '#eff6ff' : '#fef3c7',
                                                                color: appt.status === 'confirmed' ? '#166534' : appt.status === 'completed' ? '#1e40af' : '#92400e'
                                                            }}>
                                                                {appt.status}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                                <button 
                                                                    onClick={() => navigate(`/patient/${appt.userId?._id || appt.userId?.patientId || appt.patientId || appt._id}/department/${encodeURIComponent(appt.department || appt.serviceName || 'Unassigned')}`)}
                                                                    style={{
                                                                        background: '#eff6ff',
                                                                        color: '#2563eb',
                                                                        border: '1px solid #bfdbfe',
                                                                        padding: '6px 10px',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    Profile
                                                                </button>
                                                                {!isReception && (
                                                                    <button 
                                                                        onClick={() => {
                                                                            setVitalsModal({ open: true, patient: appt.userId });
                                                                            setVitalsForm({
                                                                                height: appt.userId?.fertilityProfile?.height || '',
                                                                                weight: appt.userId?.fertilityProfile?.weight || '',
                                                                                bloodGroup: appt.userId?.fertilityProfile?.bloodGroup || '',
                                                                                bp: appt.userId?.fertilityProfile?.historyBp || '',
                                                                                temp: '', spo2: '', pulse: appt.userId?.fertilityProfile?.historyPulse || ''
                                                                            });
                                                                        }}
                                                                        style={{
                                                                            background: '#f0fdf4',
                                                                            color: '#16a34a',
                                                                            border: '1px solid #bbf7d0',
                                                                            padding: '6px 10px',
                                                                            borderRadius: '6px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 600
                                                                        }}
                                                                    >
                                                                        Vitals
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    onClick={() => setUploadModal({ open: true, apptId: appt._id, patientName: appt.userId?.name || 'Patient' })}
                                                                    style={{
                                                                        background: '#fdf2f8',
                                                                        color: '#db2777',
                                                                        border: '1px solid #fbcfe8',
                                                                        padding: '6px 10px',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    Report
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleOpenConsultSessions(appt.userId)}
                                                                    style={{
                                                                        background: '#faf5ff',
                                                                        color: '#7c3aed',
                                                                        border: '1px solid #e9d5ff',
                                                                        padding: '6px 10px',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    Consult
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                    </div>
                ) : (
                    /* ────────────────────────────────────────────────────────
                       HOSPITAL ADMIN OR STANDARD MENU VIEW FOR OTHER ROLES
                       ──────────────────────────────────────────────────────── */
                    (roleName || '').toLowerCase() === 'hospitaladmin' || (roleName || '').toLowerCase() === 'hospital admin' ? (
                        <>
                            {/* 1. Exact Hero Header Banner matching Reference Image 2 */}
                            <div className="ha-hero-header-card">
                                {/* Top-Left 5x5 Dot Matrix Pattern */}
                                <div className="ha-hero-dot-matrix">
                                    {[...Array(25)].map((_, i) => (
                                        <span key={i} className="ha-dot" />
                                    ))}
                                </div>

                                {/* Floating Ambient Sparkles */}
                                <div className="ha-hero-sparkles">
                                    <span className="ha-sparkle sp-1">+</span>
                                    <span className="ha-sparkle sp-2">✦</span>
                                    <span className="ha-sparkle sp-3">•</span>
                                    <span className="ha-sparkle sp-4">+</span>
                                </div>

                                {/* Bottom-Left Smooth Organic Contoured Waves */}
                                <div className="ha-hero-wave-container">
                                    <svg className="ha-hero-wave-svg" viewBox="0 0 450 140" preserveAspectRatio="none">
                                        <defs>
                                            <linearGradient id="haSoftWaveGrad1_rd" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#bfdbfe" stopOpacity="0.45" />
                                                <stop offset="60%" stopColor="#93c5fd" stopOpacity="0.25" />
                                                <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.05" />
                                            </linearGradient>
                                            <linearGradient id="haSoftWaveGrad2_rd" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
                                                <stop offset="50%" stopColor="#818cf8" stopOpacity="0.3" />
                                                <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M 0 60 C 90 20 180 90 290 50 C 370 20 410 70 450 60 L 450 140 L 0 140 Z" fill="url(#haSoftWaveGrad1_rd)" />
                                        <path d="M 0 60 C 90 20 180 90 290 50 C 370 20 410 70 450 60" fill="none" stroke="url(#haSoftWaveGrad2_rd)" strokeWidth="2.5" />
                                        <path d="M 0 95 C 110 65 200 125 320 85 C 380 65 420 100 450 95" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
                                    </svg>
                                </div>

                                {/* Main Inner Flex Content */}
                                <div className="ha-hero-inner-content">
                                    {/* Left: 3D Glowing Blue Cross in Crystal Orb with Orbital Swirls */}
                                    <div className="ha-hero-orb-container">
                                        <div className="ha-orb-halo-glow" />
                                        <div className="ha-orb-swirl-ring ring-1" />
                                        <div className="ha-orb-swirl-ring ring-2" />
                                        <div className="ha-orb-swirl-node node-1" />
                                        <div className="ha-orb-swirl-node node-2" />

                                        <div className="ha-orb-crystal-sphere">
                                            <div className="ha-orb-cross-3d">
                                                <span className="ha-orb-cross-arm-h" />
                                                <span className="ha-orb-cross-arm-v" />
                                                <span className="ha-orb-cross-core-shine" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Center: Welcome / Greeting Info (Single Line with Cycle Animation) */}
                                    <div className="ha-hero-center-info">
                                        {/* Greeting & Username in ONE single line */}
                                        <div className="ha-hero-title-single-line-wrap">
                                            <h1 className="ha-hero-greeting-single-line">
                                                <span className="ha-greeting-prefix">{greeting},</span>{' '}
                                                <span className="ha-animated-username-loop">
                                                    <span className="ha-guillemet">»</span> {userName || 'Kunal Sharma'} <span className="ha-guillemet">«</span>
                                                </span>
                                            </h1>
                                        </div>

                                        {/* Subtitle */}
                                        <p className="ha-hero-subtitle-text">Here's your workspace. Pick any section to get started.</p>

                                        {/* Short Cyan Underline Bar */}
                                        <div className="ha-hero-teal-accent-bar" />
                                    </div>

                                    {/* Right: 3D Hospital Building Illustration */}
                                    <div className="ha-hero-right-building">
                                        <svg className="ha-hero-building-svg" viewBox="0 0 320 210" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <radialGradient id="haSunGlow_rd" cx="50%" cy="50%" r="50%">
                                                    <stop offset="0%" stopColor="#fef08a" stopOpacity="0.85" />
                                                    <stop offset="60%" stopColor="#fef9c3" stopOpacity="0.35" />
                                                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                                                </radialGradient>
                                                <linearGradient id="haBldgGlass_rd" x1="0" y1="0" x2="1" y2="1">
                                                    <stop offset="0%" stopColor="#bae6fd" />
                                                    <stop offset="100%" stopColor="#60a5fa" />
                                                </linearGradient>
                                                <linearGradient id="haBldgTower_rd" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#3b82f6" />
                                                    <stop offset="100%" stopColor="#1d4ed8" />
                                                </linearGradient>
                                            </defs>

                                            {/* Sun Aura */}
                                            <circle cx="280" cy="42" r="28" fill="url(#haSunGlow_rd)" />
                                            <circle cx="280" cy="42" r="12" fill="#ffffff" />

                                            {/* Flying Birds */}
                                            <path d="M190 48 Q194 44 198 48 Q202 44 206 48" stroke="#94a3b8" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                                            <path d="M214 56 Q217 53 220 56 Q223 53 226 56" stroke="#94a3b8" strokeWidth="1.1" fill="none" strokeLinecap="round" />

                                            {/* City Skyline Silhouette in soft pale blue */}
                                            <path d="M25 180 V115 H50 V95 H72 V125 H95 V85 H118 V145 H145 V105 H168 V135 H192 V100 H215 V125 H238 V85 H265 V120 H295 V180 Z" fill="#e2e8f0" fillOpacity="0.45" />

                                            {/* Left Building Wing */}
                                            <rect x="75" y="65" width="70" height="115" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.2" />
                                            {[0, 1, 2, 3].map(row => (
                                                <g key={`hlw-${row}`}>
                                                    <rect x="82" y={75 + row * 22} width="14" height="14" rx="2" fill="url(#haBldgGlass_rd)" />
                                                    <rect x="102" y={75 + row * 22} width="14" height="14" rx="2" fill="url(#haBldgGlass_rd)" />
                                                    <rect x="122" y={75 + row * 22} width="14" height="14" rx="2" fill="url(#haBldgGlass_rd)" />
                                                </g>
                                            ))}

                                            {/* Right Building Wing */}
                                            <rect x="195" y="65" width="70" height="115" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.2" />
                                            {[0, 1, 2, 3].map(row => (
                                                <g key={`hrw-${row}`}>
                                                    <rect x="202" y={75 + row * 22} width="14" height="14" rx="2" fill="url(#haBldgGlass_rd)" />
                                                    <rect x="222" y={75 + row * 22} width="14" height="14" rx="2" fill="url(#haBldgGlass_rd)" />
                                                    <rect x="242" y={75 + row * 22} width="14" height="14" rx="2" fill="url(#haBldgGlass_rd)" />
                                                </g>
                                            ))}

                                            {/* Center Tower & Blue Cross Sign */}
                                            <rect x="135" y="46" width="70" height="134" rx="6" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
                                            <rect x="145" y="52" width="50" height="70" rx="3" fill="url(#haBldgTower_rd)" />
                                            {/* Cross on Tower */}
                                            <path d="M170 68 v22 M159 79 h22" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" />

                                            {/* Entrance Canopy */}
                                            <rect x="132" y="128" width="76" height="14" rx="3" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.2" />
                                            <text x="170" y="138" fontSize="7" fontWeight="900" fill="#1d4ed8" textAnchor="middle" letterSpacing="0.8">HOSPITAL</text>

                                            {/* Sliding Doors */}
                                            <rect x="148" y="142" width="44" height="38" rx="2" fill="#bfdbfe" fillOpacity="0.7" stroke="#60a5fa" />
                                            <line x1="170" y1="142" x2="170" y2="180" stroke="#2563eb" strokeWidth="1.5" />

                                            {/* Green Trees & Shrubs */}
                                            <circle cx="58" cy="176" r="14" fill="#22c55e" />
                                            <circle cx="70" cy="179" r="10" fill="#16a34a" />
                                            <circle cx="140" cy="180" r="8" fill="#15803d" />
                                            <circle cx="200" cy="180" r="8" fill="#15803d" />
                                            <circle cx="270" cy="176" r="13" fill="#22c55e" />
                                            <circle cx="282" cy="179" r="10" fill="#16a34a" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* 2. Exact Quick Operations Section matching Reference Image 2 */}
                            <div className="ha-quick-ops-card">
                                {/* Header */}
                                <div className="ha-quick-ops-header">
                                    <div className="ha-quick-ops-lightning-icon">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                        </svg>
                                    </div>
                                    <div className="ha-quick-ops-title-group">
                                        <h3 className="ha-quick-ops-title">Quick Operations</h3>
                                        <p className="ha-quick-ops-subtitle">
                                            Jump to the areas you manage most frequently. Contact your Central Admin to manage question libraries, test packages, or medicine catalogs.
                                        </p>
                                    </div>
                                </div>

                                {/* 6 Grid Action Cards (3x2) */}
                                <div className="ha-quick-ops-grid">
                                    {/* 1. Doctors */}
                                    <div 
                                        className="ha-quick-card card-doctors" 
                                        onClick={() => navigate('/admin/doctors')}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="ha-quick-card-icon-box icon-doctors">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <path d="M19 8v6M22 11h-6" />
                                            </svg>
                                        </div>
                                        <div className="ha-quick-card-info">
                                            <h4 className="ha-quick-card-name">Doctors</h4>
                                            <p className="ha-quick-card-desc">Manage doctor profiles & schedules</p>
                                        </div>
                                        <span className="ha-quick-card-chevron">›</span>
                                    </div>

                                    {/* 2. Labs */}
                                    <div 
                                        className="ha-quick-card card-labs" 
                                        onClick={() => navigate('/admin/lab-tests')}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="ha-quick-card-icon-box icon-labs">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 3h6M10 3v7l-4.5 8.5A2 2 0 0 0 7.25 21h9.5a2 2 0 0 0 1.75-2.5L14 10V3" />
                                                <path d="M7 16h10" />
                                            </svg>
                                        </div>
                                        <div className="ha-quick-card-info">
                                            <h4 className="ha-quick-card-name">Labs</h4>
                                            <p className="ha-quick-card-desc">Configure lab departments</p>
                                        </div>
                                        <span className="ha-quick-card-chevron">›</span>
                                    </div>

                                    {/* 3. Pharmacy */}
                                    <div 
                                        className="ha-quick-card card-pharmacy" 
                                        onClick={() => navigate('/pharmacy/inventory')}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="ha-quick-card-icon-box icon-pharmacy">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                                                <path d="m8.5 8.5 7 7" />
                                            </svg>
                                        </div>
                                        <div className="ha-quick-card-info">
                                            <h4 className="ha-quick-card-name">Pharmacy</h4>
                                            <p className="ha-quick-card-desc">Pharmacy inventory & orders</p>
                                        </div>
                                        <span className="ha-quick-card-chevron">›</span>
                                    </div>

                                    {/* 4. Services */}
                                    <div 
                                        className="ha-quick-card card-services" 
                                        onClick={() => navigate('/admin/services')}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="ha-quick-card-icon-box icon-services">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                            </svg>
                                        </div>
                                        <div className="ha-quick-card-info">
                                            <h4 className="ha-quick-card-name">Services</h4>
                                            <p className="ha-quick-card-desc">Hospital services & pricing</p>
                                        </div>
                                        <span className="ha-quick-card-chevron">›</span>
                                    </div>

                                    {/* 5. Manage Users */}
                                    <div 
                                        className="ha-quick-card card-users" 
                                        onClick={() => navigate('/admin/users')}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="ha-quick-card-icon-box icon-users">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                            </svg>
                                        </div>
                                        <div className="ha-quick-card-info">
                                            <h4 className="ha-quick-card-name">Manage Users</h4>
                                            <p className="ha-quick-card-desc">View and manage all staff</p>
                                        </div>
                                        <span className="ha-quick-card-chevron">›</span>
                                    </div>

                                    {/* 6. Question Library */}
                                    <div 
                                        className="ha-quick-card card-questions" 
                                        onClick={() => navigate('/hospitaladmin/question-library')}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <div className="ha-quick-card-icon-box icon-questions">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                <polyline points="14 2 14 8 20 8" />
                                                <circle cx="12" cy="17" r="0.5" fill="#e11d48" />
                                                <path d="M10 13a2 2 0 1 1 3.5 1.5c-.5.5-1.5 1-1.5 1.5" />
                                            </svg>
                                        </div>
                                        <div className="ha-quick-card-info">
                                            <h4 className="ha-quick-card-name">Question Library</h4>
                                            <p className="ha-quick-card-desc">Manage diagnostic questions</p>
                                        </div>
                                        <span className="ha-quick-card-chevron">›</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Welcome Hero for other roles */}
                            <div className="welcome-hero">
                                <span className="welcome-emoji">👋</span>
                                <div className="role-badge-large">{roleName}</div>
                                <h1>{greeting}, <span>{userName}</span></h1>
                                <p>Here's your workspace. Pick any section to get started.</p>
                            </div>

                            {/* Quick Access Cards */}
                            {navLinks.length > 0 ? (
                                <>
                                    <div className="section-title">⚡ Quick Access</div>
                                    <div className="nav-cards-grid">
                                        {navLinks.map((link, index) => (
                                            <div
                                                key={index}
                                                className="nav-card"
                                                onClick={() => navigate(link.path)}
                                            >
                                                <div className="nav-card-icon">
                                                    {getIconForPath(link.path, link.label)}
                                                </div>
                                                <div className="nav-card-content">
                                                    <h3>{link.label}</h3>
                                                    <p>{getDescForLink(link.label)}</p>
                                                </div>
                                                <span className="nav-card-arrow">→</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="empty-state">
                                    <span className="empty-icon">📭</span>
                                    <h3>No pages assigned yet</h3>
                                    <p>Contact your superadmin to set up navigation links for your role.</p>
                                </div>
                            )}
                        </>
                    )
                )}

                {/* VITALS MODAL */}
                {vitalsModal.open && (
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
                            width: '100%',
                            maxWidth: '450px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                        }}>
                            <h3 style={{ margin: '0 0 16px', color: '#1e293b', fontSize: '1.25rem', fontWeight: 800 }}>Record Vitals</h3>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>
                                Patient: <strong>{vitalsModal.patient?.name}</strong>
                            </p>
                            <form onSubmit={handleVitalsSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Height (cm)</label>
                                        <input type="number" value={vitalsForm.height} name="height" onChange={handleVitalsFormChange} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Weight (kg)</label>
                                        <input type="number" value={vitalsForm.weight} name="weight" onChange={handleVitalsFormChange} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Blood Group</label>
                                        <input type="text" value={vitalsForm.bloodGroup} name="bloodGroup" onChange={handleVitalsFormChange} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Blood Pressure</label>
                                        <input type="text" placeholder="120/80" value={vitalsForm.bp} name="bp" onChange={handleVitalsFormChange} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Pulse (bpm)</label>
                                        <input type="number" value={vitalsForm.pulse} name="pulse" onChange={handleVitalsFormChange} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '4px' }}>Temp (°F)</label>
                                        <input type="number" step="0.1" value={vitalsForm.temp} name="temp" onChange={handleVitalsFormChange} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '8px' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setVitalsModal({ open: false, patient: null })}
                                        style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={savingVitals}
                                        style={{ padding: '8px 20px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        {savingVitals ? 'Saving...' : 'Save Vitals'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

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
                            width: '100%',
                            maxWidth: '400px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                        }}>
                            <h3 style={{ margin: '0 0 16px', color: '#1e293b', fontSize: '1.2rem', fontWeight: 800 }}>Upload Patient Report</h3>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>
                                Patient: <strong>{uploadModal.patientName}</strong>
                            </p>
                            <form onSubmit={handleReportSubmit}>
                                <div style={{ marginBottom: '20px' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '8px' }}>Select File (PDF or Image)</label>
                                    <input 
                                        type="file" 
                                        accept="image/*,application/pdf"
                                        required
                                        onChange={e => setSelectedReportFile(e.target.files[0])}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            border: '2px dashed #cbd5e1',
                                            borderRadius: '8px',
                                            background: '#f8fafc',
                                            cursor: 'pointer'
                                        }}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setSelectedReportFile(null);
                                            setUploadModal({ open: false, apptId: null, patientName: '' });
                                        }}
                                        style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        style={{ padding: '8px 20px', background: '#db2777', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Upload
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* CONSULTATION HISTORY VIEW MODAL */}
                {consultModal.open && (
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
                            width: '100%',
                            maxWidth: '600px',
                            maxHeight: '80vh',
                            overflowY: 'auto',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eff6ff', paddingBottom: '12px' }}>
                                <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.25rem', fontWeight: 800 }}>Clinical Consult Sessions</h3>
                                <button 
                                    onClick={() => setConsultModal({ open: false, patient: null, sessions: [] })}
                                    style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}
                                >
                                    ✖
                                </button>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '20px' }}>
                                Patient: <strong>{consultModal.patient?.name}</strong>
                            </p>

                            {consultModal.sessions.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                                    No completed clinical consult sessions found.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {consultModal.sessions.map((sess, idx) => (
                                        <div key={sess._id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', background: '#f8fafc' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontWeight: 700, color: '#1e293b' }}>Dr. {sess.doctorId?.name || sess.doctorName || 'N/A'}</span>
                                                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{formatDate(sess.appointmentDate)} at {sess.appointmentTime}</span>
                                            </div>
                                            <div style={{ fontSize: '0.88rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <div><strong>Service:</strong> {sess.serviceName || 'Consultation'}</div>
                                                {sess.diagnosis && <div><strong>Diagnosis:</strong> {sess.diagnosis}</div>}
                                                {sess.notes && <div><strong>Doctor Notes:</strong> {sess.notes}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                                <button 
                                    onClick={() => setConsultModal({ open: false, patient: null, sessions: [] })}
                                    style={{ padding: '8px 24px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Permissions Preview */}
                {permissions.length > 0 && (
                    <div className="permissions-section">
                        <h3>🔐 Your Permissions</h3>
                        <div className="perm-tags">
                            {permissions.map((perm, i) => (
                                <span key={i} className="perm-tag">
                                    {perm.replace(/_/g, ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoleDashboard;
