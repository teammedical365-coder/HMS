import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';
import './DoctorDashboard.css'; // We will create this CSS below

const DoctorDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ today: 0, pending: 0, completed: 0 });
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [user] = useState(JSON.parse(localStorage.getItem('user') || '{}'));

    // Availability State (Matches AdminDoctors structure)
    const [availability, setAvailability] = useState(null);
    const [showAvailability, setShowAvailability] = useState(false);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);

            // 1. Get Appointments
            const aptRes = await doctorAPI.getAppointments();
            if (aptRes.success) {
                const apts = aptRes.appointments;
                setAppointments(apts);

                // Calculate Stats
                const today = new Date().toISOString().split('T')[0];
                setStats({
                    today: apts.filter(a => a.appointmentDate.startsWith(today)).length,
                    pending: apts.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
                    completed: apts.filter(a => a.status === 'completed').length
                });
            }

            // 2. Get Doctor Profile (for availability)
            // Note: We might need a specific endpoint for "My Profile", 
            // but usually this is fetched via context or a specific GET /doctor/me endpoint.
            // For now, we assume availability is managed in Admin, 
            // OR we add a fetch here if you implement 'getMe' in doctorAPI.

        } catch (err) {
            console.error("Dashboard Error:", err);
        } finally {
            setLoading(false);
        }
    };

    const handlePatientClick = (appointmentId) => {
        // Navigate to the detailed view we created
        navigate(`/doctor/patient/${appointmentId}`);
    };

    if (loading) return <div className="loading-screen">Loading Dashboard...</div>;

    return (
        <div className="doctor-dashboard-container">
            <div className="doctor-header">
                <div>
                    <h1>Dr. {user.name}</h1>
                    <p className="subtitle">Dashboard & Patient Management</p>
                </div>
                <div className="header-actions">
                    {/* Placeholder for Availability Toggle */}
                    <button className="btn-secondary">📅 My Schedule</button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-grid">
                <div className="stat-card blue">
                    <h3>{stats.today}</h3>
                    <p>Today's Appointments</p>
                </div>
                <div className="stat-card orange">
                    <h3>{stats.pending}</h3>
                    <p>Pending / Upcoming</p>
                </div>
                <div className="stat-card green">
                    <h3>{stats.completed}</h3>
                    <p>Completed Visits</p>
                </div>
            </div>

            {/* Appointments List */}
            <div className="appointments-section">
                <h2>Today's Schedule & Upcoming</h2>
                {appointments.length === 0 ? (
                    <div className="empty-state">No appointments found.</div>
                ) : (
                    <table className="doctor-table">
                        <thead>
                            <tr>
                                <th>Time / Date</th>
                                <th>Patient Name</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {appointments.map(apt => (
                                <tr key={apt._id}>
                                    <td>
                                        <div className="time-cell">
                                            <span className="time">{apt.appointmentTime}</span>
                                            <span className="date">{new Date(apt.appointmentDate).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="patient-cell">
                                            <strong>{apt.userId?.name || 'Walk-in Patient'}</strong>
                                            <small>{apt.patientId || 'ID: Pending'}</small>
                                        </div>
                                    </td>
                                    <td>{apt.serviceName || 'Consultation'}</td>
                                    <td><span className={`status-badge ${apt.status}`}>{apt.status}</span></td>
                                    <td>
                                        <button
                                            className="btn-view"
                                            onClick={() => handlePatientClick(apt._id)}
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default DoctorDashboard;