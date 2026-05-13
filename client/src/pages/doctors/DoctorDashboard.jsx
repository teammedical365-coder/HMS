import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';
import './DoctorDashboard.css'; // We will create this CSS below

const DoctorDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ today: 0, pending: 0, completed: 0 });
    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [user] = useState(JSON.parse(localStorage.getItem('user') || '{}'));

    const isClinicDoctor = user?.clinicType === 'clinic';

    useEffect(() => {
        if (isClinicDoctor) {
            // Clinic doctors use the Clinic Dashboard, not this page
            navigate('/hospitaladmin', { replace: true });
            return;
        }
        fetchDashboardData();
    }, []); // eslint-disable-line

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            setError('');

            const aptRes = await doctorAPI.getAppointments();
            if (aptRes.success) {
                const apts = aptRes.appointments || [];
                setAppointments(apts);

                const todayStr = new Date().toISOString().split('T')[0];
                setStats({
                    today: apts.filter(a => a.appointmentDate && String(a.appointmentDate).startsWith(todayStr)).length,
                    pending: apts.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
                    completed: apts.filter(a => a.status === 'completed').length
                });
            } else {
                setError(aptRes.message || 'Failed to load appointments');
            }
        } catch (err) {
            const msg = err?.response?.data?.message || err.message || 'Network error';
            setError(msg);
            console.error('DoctorDashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handlePatientClick = (appointmentId) => {
        // Navigate to the detailed view we created
        navigate(`/doctor/patient/${appointmentId}`);
    };

    if (loading) return <div className="loading-screen">Loading Dashboard...</div>;
    if (error) return (
        <div className="doctor-dashboard-container">
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', padding: '20px', margin: '20px', color: '#dc2626' }}>
                <strong>Error loading dashboard:</strong> {error}
                <button onClick={fetchDashboardData} style={{ marginLeft: '12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer' }}>Retry</button>
            </div>
        </div>
    );

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
                    <div className="empty-state">
                        <p>No appointments found.</p>
                        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '8px' }}>Your appointments will appear here once booked by reception. Contact your admin if you expect to see appointments.</p>
                    </div>
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