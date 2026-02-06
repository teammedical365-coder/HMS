import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doctorAPI } from '../../utils/api';
import './Patient.css';

const Patient = () => {
    const navigate = useNavigate();
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' or 'patients'

    useEffect(() => {
        if (activeTab === 'appointments') fetchAppointments();
        if (activeTab === 'patients') fetchPatients();
    }, [activeTab]);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const res = await doctorAPI.getAppointments();
            if (res.success) setAppointments(res.appointments);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const fetchPatients = async () => {
        setLoading(true);
        try {
            const res = await doctorAPI.getPatients();
            if (res.success) setPatients(res.patients);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleOpenSession = (appointmentId) => {
        navigate(`/doctor/patient/${appointmentId}`);
    };

    // --- INSTANT FOLLOW-UP CREATION ---
    const handleStartSession = async (patient) => {
        if (!window.confirm(`Start new follow-up session for ${patient.name}?`)) return;

        try {
            const res = await doctorAPI.startSession(patient._id);
            if (res.success) {
                // Navigate to the newly created session
                navigate(`/doctor/patient/${res.appointment._id}`);
            } else {
                alert("Failed to create session: " + res.message);
            }
        } catch (err) {
            alert("Error creating session");
        }
    };

    return (
        <div className="doctor-dashboard">
            <div className="dashboard-header">
                <h1>Doctor Dashboard</h1>
                <div className="tabs">
                    <button
                        className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
                        onClick={() => setActiveTab('appointments')}
                    >
                        📅 Today's Queue
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'patients' ? 'active' : ''}`}
                        onClick={() => setActiveTab('patients')}
                    >
                        👥 All Patients (History)
                    </button>
                </div>
            </div>

            {loading && <div className="loading">Loading...</div>}

            {!loading && activeTab === 'appointments' && (
                <div className="appointments-list">
                    <h3>Upcoming Sessions</h3>
                    {appointments.length === 0 ? <p>No appointments today.</p> : (
                        <table className="doctor-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
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
                                            {new Date(apt.appointmentDate).toLocaleDateString()} <br />
                                            <strong>{apt.appointmentTime}</strong>
                                        </td>
                                        <td>{apt.userId?.name || 'Walk-in'}</td>
                                        <td>{apt.serviceName || 'Consultation'}</td>
                                        <td><span className={`status ${apt.status}`}>{apt.status}</span></td>
                                        <td>
                                            <button
                                                className="btn-view"
                                                onClick={() => handleOpenSession(apt._id)}
                                            >
                                                Open Session
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {!loading && activeTab === 'patients' && (
                <div className="appointments-list">
                    <h3>Patient Records & History</h3>
                    {patients.length === 0 ? <p>No patients found.</p> : (
                        <table className="doctor-table">
                            <thead>
                                <tr>
                                    <th>Patient Name</th>
                                    <th>Phone</th>
                                    <th>Last Visit</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map(p => (
                                    <tr key={p._id}>
                                        <td><strong>{p.name}</strong><br /><small>{p.patientId}</small></td>
                                        <td>{p.phone}</td>
                                        <td>{new Date(p.lastVisit).toLocaleDateString()}</td>
                                        <td>
                                            <button
                                                className="btn-view"
                                                style={{ background: '#27ae60' }}
                                                onClick={() => handleStartSession(p)}
                                            >
                                                Start Session
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
};

export default Patient;