import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assistantAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import './DoctorAssistantDashboard.css';
import {
    FiUsers, FiClock, FiActivity, FiCheckCircle, FiCheckSquare,
    FiUserCheck, FiBookOpen, FiRefreshCw, FiArrowRight, FiFileText
} from 'react-icons/fi';

const DoctorAssistantDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchDashboard = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await assistantAPI.getDashboard();
            if (res.success) {
                setDashboardData(res);
            } else {
                toast.error(res.message || 'Failed to load dashboard data');
            }
        } catch (error) {
            console.error('Assistant dashboard load error:', error);
            toast.error('Error connecting to server');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboard();
    }, [fetchDashboard]);

    const summary = dashboardData?.summary || {
        totalTodayPatients: 0,
        waiting: 0,
        inProgress: 0,
        readyForDoctor: 0,
        completed: 0
    };

    const myDoctors = dashboardData?.myDoctors || [];
    const patientQueue = dashboardData?.patientQueue || [];
    const authorizedDepartments = dashboardData?.authorizedDepartments || [];
    const recentActivities = dashboardData?.recentActivities || [];

    const getStatusBadge = (status) => {
        switch (status) {
            case 'ready_for_doctor':
                return <span className="da-badge ready_for_doctor">● Ready For Doctor</span>;
            case 'preparation_in_progress':
                return <span className="da-badge preparation_in_progress">● Preparation In Progress</span>;
            case 'completed':
                return <span className="da-badge completed">✓ Completed</span>;
            default:
                return <span className="da-badge waiting_for_assistant">● Waiting For Assistant</span>;
        }
    };

    return (
        <div className="da-container">
            {/* Top Clinical Header */}
            <div className="da-header">
                <div className="da-title-wrap">
                    <h1 className="da-title">
                        <FiUserCheck style={{ color: '#0ea5e9' }} />
                        Doctor Assistant — Clinical Preparation
                    </h1>
                    <p className="da-subtitle">
                        Pre-consultation patient intake, vitals, and department-specific questionnaire management
                    </p>
                </div>
                <div className="da-header-actions">
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={() => fetchDashboard(true)}
                        disabled={refreshing || loading}
                    >
                        <FiRefreshCw className={refreshing ? 'spin' : ''} />
                        Refresh
                    </button>
                    <Link to="/assistant/queue" className="da-btn da-btn-primary">
                        <FiUsers />
                        Open Patient Queue
                    </Link>
                </div>
            </div>

            {/* Metrics Summary Cards */}
            <div className="da-metrics-grid">
                <div className="da-metric-card">
                    <div className="da-metric-icon blue">
                        <FiUsers />
                    </div>
                    <div className="da-metric-info">
                        <span className="da-metric-value">{summary.totalTodayPatients}</span>
                        <span className="da-metric-label">Today's Patients</span>
                    </div>
                </div>

                <div className="da-metric-card">
                    <div className="da-metric-icon amber">
                        <FiClock />
                    </div>
                    <div className="da-metric-info">
                        <span className="da-metric-value">{summary.waiting}</span>
                        <span className="da-metric-label">Waiting For Assistant</span>
                    </div>
                </div>

                <div className="da-metric-card">
                    <div className="da-metric-icon cyan">
                        <FiActivity />
                    </div>
                    <div className="da-metric-info">
                        <span className="da-metric-value">{summary.inProgress}</span>
                        <span className="da-metric-label">Preparation In Progress</span>
                    </div>
                </div>

                <div className="da-metric-card">
                    <div className="da-metric-icon emerald">
                        <FiCheckCircle />
                    </div>
                    <div className="da-metric-info">
                        <span className="da-metric-value">{summary.readyForDoctor}</span>
                        <span className="da-metric-label">Ready For Doctor</span>
                    </div>
                </div>

                <div className="da-metric-card">
                    <div className="da-metric-icon purple">
                        <FiCheckSquare />
                    </div>
                    <div className="da-metric-info">
                        <span className="da-metric-value">{summary.completed}</span>
                        <span className="da-metric-label">Completed Consultations</span>
                    </div>
                </div>
            </div>

            {/* MY DOCTORS SECTION */}
            <div className="da-section-card">
                <div className="da-section-header">
                    <div>
                        <h2 className="da-section-title">
                            👨‍⚕️ My Assigned Doctors
                        </h2>
                        <p className="da-section-subtitle">
                            Doctors and departments you are authorized to prepare patients for
                        </p>
                    </div>
                    <span className="da-badge" style={{ background: '#f0f9ff', color: '#0369a1' }}>
                        {myDoctors.length} Assigned {myDoctors.length === 1 ? 'Doctor' : 'Doctors'}
                    </span>
                </div>

                {myDoctors.length === 0 ? (
                    <div className="da-empty-state">
                        No doctors currently assigned. Please contact your Hospital Administrator.
                    </div>
                ) : (
                    <div className="da-doctors-grid">
                        {myDoctors.map(doc => (
                            <div key={doc._id} className="da-doctor-card">
                                <div className="da-doctor-avatar">
                                    {doc.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="da-doctor-details">
                                    <h3 className="da-doctor-name">{doc.name}</h3>
                                    <span className="da-doctor-dept">
                                        {doc.departments?.[0] || doc.specialty || 'General Medicine'}
                                    </span>
                                </div>
                                <div className="da-doctor-badge">
                                    {doc.todayPatientsCount} {doc.todayPatientsCount === 1 ? 'Patient' : 'Patients'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* TODAY'S PATIENT QUEUE */}
            <div className="da-section-card">
                <div className="da-section-header">
                    <div>
                        <h2 className="da-section-title">
                            📋 Today's Patient Queue
                        </h2>
                        <p className="da-section-subtitle">
                            Patients scheduled with your assigned doctors for pre-consultation preparation
                        </p>
                    </div>
                    <Link to="/assistant/queue" className="da-btn da-btn-secondary" style={{ fontSize: '0.8rem' }}>
                        View Full Queue <FiArrowRight />
                    </Link>
                </div>

                {loading ? (
                    <div className="da-empty-state">Loading patient queue...</div>
                ) : patientQueue.length === 0 ? (
                    <div className="da-empty-state">No appointments scheduled for your assigned doctors today.</div>
                ) : (
                    <div className="da-table-wrap">
                        <table className="da-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Patient Details</th>
                                    <th>Doctor</th>
                                    <th>Department</th>
                                    <th>Preparation Status</th>
                                    <th>Progress</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patientQueue.map(item => (
                                    <tr key={item.appointmentId}>
                                        <td style={{ fontWeight: 600, color: '#0f172a' }}>
                                            {item.appointmentTime}
                                        </td>
                                        <td>
                                            <div className="da-patient-cell">
                                                <span className="da-patient-name">{item.patient.name}</span>
                                                <span className="da-patient-uhid">
                                                    UHID: {item.patient.uhid} {item.patient.age ? `• ${item.patient.age}y` : ''} {item.patient.gender ? `• ${item.patient.gender}` : ''}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            {item.doctor.name}
                                        </td>
                                        <td>
                                            <span className="da-doctor-dept">
                                                {item.department}
                                            </span>
                                        </td>
                                        <td>
                                            {getStatusBadge(item.preparationStatus)}
                                        </td>
                                        <td>
                                            <div className="da-progress-wrap">
                                                <div className="da-progress-bar-bg">
                                                    <div
                                                        className={`da-progress-bar-fill ${item.preparationStatus === 'ready_for_doctor' ? 'ready' : ''}`}
                                                        style={{ width: `${item.progressPercentage}%` }}
                                                    />
                                                </div>
                                                <span className="da-progress-text">{item.progressPercentage}%</span>
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {item.preparationStatus === 'waiting_for_assistant' ? (
                                                <button
                                                    className="da-action-btn start"
                                                    onClick={() => navigate(`/assistant/preparation/${item.appointmentId}`)}
                                                >
                                                    Start Prep
                                                </button>
                                            ) : item.preparationStatus === 'preparation_in_progress' ? (
                                                <button
                                                    className="da-action-btn continue"
                                                    onClick={() => navigate(`/assistant/preparation/${item.appointmentId}`)}
                                                >
                                                    Continue Prep
                                                </button>
                                            ) : (
                                                <button
                                                    className="da-action-btn view"
                                                    onClick={() => navigate(`/assistant/preparation/${item.appointmentId}`)}
                                                >
                                                    View Prep
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* QUESTION LIBRARY QUICK ACCESS */}
            <div className="da-section-card">
                <div className="da-section-header">
                    <div>
                        <h2 className="da-section-title">
                            <FiBookOpen style={{ color: '#0ea5e9' }} />
                            Authorized Question Library
                        </h2>
                        <p className="da-section-subtitle">
                            Department-specific patient intake protocols and questionnaires
                        </p>
                    </div>
                    <Link to="/assistant/question-library" className="da-btn da-btn-secondary" style={{ fontSize: '0.8rem' }}>
                        Explore Question Library <FiArrowRight />
                    </Link>
                </div>

                <div className="da-ql-categories-grid">
                    {authorizedDepartments.map(dept => (
                        <Link
                            key={dept}
                            to={`/assistant/question-library?dept=${encodeURIComponent(dept)}`}
                            className="da-ql-cat-card"
                        >
                            <span className="da-ql-cat-name">📋 {dept} Intake Protocol</span>
                            <span className="da-ql-cat-count">Active</span>
                        </Link>
                    ))}
                    {authorizedDepartments.length === 0 && (
                        <div className="da-empty-state" style={{ gridColumn: '1 / -1' }}>
                            No department questions loaded yet.
                        </div>
                    )}
                </div>
            </div>

            {/* RECENT ACTIVITY */}
            {recentActivities.length > 0 && (
                <div className="da-section-card">
                    <div className="da-section-header">
                        <div>
                            <h2 className="da-section-title">
                                🕒 Recent Activity
                            </h2>
                            <p className="da-section-subtitle">
                                Audit history of patient intake and preparation updates
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recentActivities.map(act => (
                            <div
                                key={act._id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    background: '#f8fafc',
                                    borderRadius: '8px',
                                    fontSize: '0.84rem'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: 700, color: '#0ea5e9' }}>
                                        {act.action.replace(/_/g, ' ')}
                                    </span>
                                    <span style={{ color: '#475569' }}>
                                        — {act.targetLabel || 'Patient Record'}
                                    </span>
                                </div>
                                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
                                    {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorAssistantDashboard;
