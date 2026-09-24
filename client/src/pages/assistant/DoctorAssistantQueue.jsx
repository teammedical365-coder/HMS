import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { assistantAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import './DoctorAssistantQueue.css';
import './DoctorAssistantDashboard.css';
import {
    FiSearch, FiFilter, FiCalendar, FiRefreshCw, FiUserCheck,
    FiCheckCircle, FiClock, FiActivity, FiUsers, FiArrowLeft
} from 'react-icons/fi';

const DoctorAssistantQueue = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [appointments, setAppointments] = useState([]);
    const [doctors, setDoctors] = useState([]);
    const [departments, setDepartments] = useState([]);

    // Filters
    const [searchText, setSearchText] = useState('');
    const [selectedDoctor, setSelectedDoctor] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [showAllDates, setShowAllDates] = useState(false);

    const fetchQueue = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        try {
            const params = {
                date: showAllDates ? 'ALL' : (selectedDate || undefined),
                doctorId: selectedDoctor || undefined,
                department: selectedDepartment || undefined,
                status: selectedStatus || undefined,
                search: searchText || undefined
            };

            const [apptsRes, docsRes] = await Promise.all([
                assistantAPI.getAppointments(params),
                assistantAPI.getDoctors()
            ]);

            if (apptsRes?.success) {
                setAppointments(apptsRes.appointments || []);
                if (apptsRes.authorizedDepartments && apptsRes.authorizedDepartments.length > 0) {
                    const cleanDepts = Array.from(new Set(apptsRes.authorizedDepartments.map(d => d && d.trim()))).filter(Boolean);
                    setDepartments(cleanDepts);
                }
            }
            if (docsRes?.success) {
                setDoctors(docsRes.doctors || []);
            }
        } catch (error) {
            console.error('Queue load error:', error);
            // Non-blocking toast only on explicit user action
            if (!isSilent) {
                toast.error('Unable to fetch some appointments. Please check connection.');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedDate, showAllDates, selectedDoctor, selectedDepartment, selectedStatus, searchText]);

    useEffect(() => {
        fetchQueue();
    }, [fetchQueue]);

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
        <div className="daq-container">
            {/* Header */}
            <div className="daq-header">
                <div>
                    <h1 className="daq-title">
                        <FiUsers style={{ color: '#0ea5e9' }} />
                        Patient Preparation Queue
                    </h1>
                    <p className="daq-subtitle">
                        {showAllDates
                            ? 'Showing all recent & upcoming patient appointments'
                            : `Showing appointments for ${new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
                        }
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={() => navigate('/assistant/dashboard')}
                    >
                        <FiArrowLeft /> Dashboard
                    </button>
                    <button
                        className={`da-btn ${showAllDates ? 'da-btn-primary' : 'da-btn-secondary'}`}
                        onClick={() => setShowAllDates(prev => !prev)}
                    >
                        {showAllDates ? '📅 Filter Today' : '📋 Show All Dates'}
                    </button>
                    <button
                        className="da-btn da-btn-secondary"
                        onClick={() => fetchQueue(true)}
                        disabled={refreshing || loading}
                    >
                        <FiRefreshCw className={refreshing ? 'spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="daq-filter-bar">
                {/* Search */}
                <div className="daq-search-box">
                    <FiSearch className="daq-search-icon" />
                    <input
                        type="text"
                        placeholder="Search patient name, UHID, phone..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="daq-search-input"
                    />
                </div>

                {/* Date */}
                {!showAllDates && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FiCalendar style={{ color: '#64748b' }} />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="daq-date-input"
                        />
                    </div>
                )}

                {/* Doctor Filter */}
                <select
                    value={selectedDoctor}
                    onChange={(e) => setSelectedDoctor(e.target.value)}
                    className="daq-select"
                >
                    <option value="">All Assigned Doctors ({doctors.length})</option>
                    {doctors.map(d => (
                        <option key={d._id} value={d._id}>
                            {d.name} ({d.departments?.[0] || d.specialty || 'General'})
                        </option>
                    ))}
                </select>

                {/* Department Filter */}
                <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="daq-select"
                >
                    <option value="">All Authorized Departments</option>
                    {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>

                {/* Status Filter */}
                <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="daq-select"
                >
                    <option value="">All Statuses</option>
                    <option value="waiting_for_assistant">Waiting For Assistant</option>
                    <option value="preparation_in_progress">Preparation In Progress</option>
                    <option value="ready_for_doctor">Ready For Doctor</option>
                    <option value="completed">Completed</option>
                </select>
            </div>

            {/* Queue Table */}
            <div className="daq-queue-card">
                {loading ? (
                    <div className="da-empty-state">Loading appointments...</div>
                ) : appointments.length === 0 ? (
                    <div className="da-empty-state">No appointments found matching your filter criteria.</div>
                ) : (
                    <div className="da-table-wrap">
                        <table className="da-table">
                            <thead>
                                <tr>
                                    <th>Token / Time</th>
                                    <th>Patient</th>
                                    <th>Doctor</th>
                                    <th>Department</th>
                                    <th>Status</th>
                                    <th>Preparation Progress</th>
                                    <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {appointments.map(item => (
                                    <tr key={item.appointmentId}>
                                        <td>
                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                {item.tokenNumber ? `Token #${item.tokenNumber}` : item.appointmentTime}
                                            </div>
                                            {item.tokenNumber && (
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    {item.appointmentTime}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className="da-patient-cell">
                                                <span className="da-patient-name">{item.patient.name}</span>
                                                <span className="da-patient-uhid">
                                                    UHID: {item.patient.uhid} {item.patient.age ? `• ${item.patient.age}y` : ''} {item.patient.gender ? `• ${item.patient.gender}` : ''} {item.patient.phone ? `• ${item.patient.phone}` : ''}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                                {item.doctor.name}
                                            </div>
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
        </div>
    );
};

export default DoctorAssistantQueue;
