import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { receptionAPI, patientAPI, reportAPI } from '../../utils/api';
import { FiSearch, FiUsers, FiCalendar, FiActivity } from 'react-icons/fi';

const ReceptionPatients = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const [loadingAppts, setLoadingAppts] = useState(false);

    // Search and tab states
    const [searchText, setSearchText] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'today' or 'all'

    // Modals state
    const [uploadModal, setUploadModal] = useState({ open: false, apptId: null, patientName: '', patientId: null });
    const [selectedReportFile, setSelectedReportFile] = useState(null);
    const [uploadingReport, setUploadingReport] = useState(false);
    const [profileModal, setProfileModal] = useState({ open: false, patient: null });

    useEffect(() => {
        fetchRecentPatients();
        fetchAppointments();
    }, []);

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

    const handleReportSubmit = async (e) => {
        e.preventDefault();
        if (!selectedReportFile) {
            alert('Please select a file to upload!');
            return;
        }
        if (!uploadModal.apptId) {
            alert('Could not identify appointment ID for report upload.');
            return;
        }
        setUploadingReport(true);
        try {
            const formData = new FormData();
            formData.append('reportFile', selectedReportFile);
            formData.append('appointmentId', uploadModal.apptId);
            
            const res = await reportAPI.uploadReport(formData);
            if (res.success) {
                alert(`Report file "${selectedReportFile.name}" uploaded successfully for ${uploadModal.patientName}!`);
                setSelectedReportFile(null);
                setUploadModal({ open: false, apptId: null, patientName: '', patientId: null });
            } else {
                alert(res.message || 'Failed to upload report.');
            }
        } catch (err) {
            console.error('Error uploading report:', err);
            alert('Error uploading report file.');
        } finally {
            setUploadingReport(false);
        }
    };

    const todayStr = new Date().toISOString().split('T')[0];

    // Stats calculations
    const totalPatientsCount = patients.length;
    const upcomingApptsCount = appointments.filter(a => {
        const isFuture = a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] >= todayStr;
        return isFuture && ['pending', 'confirmed'].includes(a.status);
    }).length;
    const completedTodayCount = appointments.filter(a => {
        const isToday = a.appointmentDate && new Date(a.appointmentDate).toISOString().split('T')[0] === todayStr;
        return isToday && a.status === 'completed';
    }).length;

    return (
        <div className="role-dashboard" style={{ padding: '20px' }}>
            <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
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

                {/* SEARCH AND TOGGLE TAB ROW */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginTop: '10px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        width: '360px',
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
                        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Loading appointments queue...</div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', boxSizing: 'border-box' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #edf2f7' }}>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>#</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Patient</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Contact</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Doctor</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Time</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Date</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Status</th>
                                        <th style={{ padding: '12px 14px', color: '#475569', fontWeight: '800', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center', whiteSpace: 'nowrap' }}>Action</th>
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
                                                <td style={{ padding: '14px 14px', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>{idx + 1}</td>
                                                <td style={{ padding: '14px 14px' }}>
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
                                                            fontSize: '0.9rem',
                                                            flexShrink: 0
                                                        }}>
                                                            {(appt.userId?.name || 'P')[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700, color: '#1e293b' }}>{appt.userId?.name || 'Walk-in'}</div>
                                                            <div title={appt.userId?.patientId} style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                MRN: {appt.userId?.patientId ? (appt.userId.patientId.length > 18 ? `${appt.userId.patientId.substring(0, 15)}...` : appt.userId.patientId) : 'N/A'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                                                    <span style={{ fontWeight: 600, color: '#334155' }}>{appt.userId?.phone || '-'}</span>
                                                </td>
                                                <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{
                                                            width: '30px',
                                                            height: '30px',
                                                            borderRadius: '50%',
                                                            backgroundColor: '#16a34a',
                                                            color: '#ffffff',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: '800',
                                                            fontSize: '0.8rem',
                                                            flexShrink: 0
                                                        }}>
                                                            {(appt.doctorId?.name || 'D')[0].toUpperCase()}
                                                        </div>
                                                        <span style={{ fontWeight: 600, color: '#334155' }}>{appt.doctorId?.name || 'Not Assigned'}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 14px', color: '#1e293b', fontWeight: 700, whiteSpace: 'nowrap' }}>{appt.appointmentTime}</td>
                                                <td style={{ padding: '14px 14px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatDate(appt.appointmentDate)}</td>
                                                <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
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
                                                <td style={{ padding: '14px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                                        <button 
                                                            onClick={() => navigate(`/patient/${appt.userId?._id || appt.userId?.patientId || appt.patientId || appt._id}`)}
                                                            style={{
                                                                background: '#eff6ff',
                                                                color: '#2563eb',
                                                                border: '1px solid #bfdbfe',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '6px',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >👁️ Profile</button>
                                                        <button 
                                                            onClick={() => setUploadModal({ open: true, apptId: appt._id, patientName: appt.userId?.name || 'Patient', patientId: appt.userId?._id || appt.userId?.patientId || appt.patientId || appt._id })}
                                                            style={{
                                                                background: '#fdf2f8',
                                                                color: '#db2777',
                                                                border: '1px solid #fbcfe8',
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '6px',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >📁 Upload Report</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
        </div>
    );
};

export default ReceptionPatients;
